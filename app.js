/**
 * |-| [- |_ | /\ ( ~|~ `/ |_
 *
 * Heliactyl 24.0.0
 */

"use strict";

require("./misc/console.js")();
const fs = require("fs");
const chalk = require("chalk");
const cluster = require("cluster");
const ejs = require("ejs");
const settings = require("./settings.json");

const defaultthemesettings = {
  index: "index.ejs",
  notfound: "index.ejs",
  redirect: {},
  pages: {},
  mustbeloggedin: [],
  mustbeadmin: [],
  variables: {},
};

module.exports.renderdataeval = `(async () => {
  const JavaScriptObfuscator = require('javascript-obfuscator');
  const newsettings = JSON.parse(require("fs").readFileSync("./settings.json"));
  const userPackage = req.session.userinfo ? (await db.get("package-" + req.session.userinfo.id) || newsettings.api.client.packages.default) : null;
  const arciotext = require(require("path").resolve("./misc/afk.js"));
  return {
    req,
    settings: newsettings,
    userinfo: req.session.userinfo,
    packagename: userPackage,
    extraresources: req.session.userinfo ? (await db.get("extra-" + req.session.userinfo.id) || { ram: 0, disk: 0, cpu: 0, servers: 0 }) : null,
    packages: req.session.userinfo ? newsettings.api.client.packages.list[userPackage] : null,
    coins: newsettings.api.client.coins.enabled ? (req.session.userinfo ? (await db.get("coins-" + req.session.userinfo.id) || 0) : null) : null,
    pterodactyl: req.session.pterodactyl,
    extra: theme.settings.variables,
    db,
    arcioafktext: JavaScriptObfuscator.obfuscate(\`
     let everywhat = \${newsettings.api.afk.every};
     let gaincoins = \${newsettings.api.afk.coins};
     let wspath = "ws";

     \${arciotext}
    \`)
  };
})();`;

// Load database
const Keyv = require("keyv");
const db = new Keyv(settings.database);

db.on("error", err => {
  console.log(chalk.red("Database ― An error has occurred when attempting to access the SQLite database."));
});

module.exports.db = db;

if (cluster.isMaster) {
  const numCPUs = require("os").cpus().length;
  console.log(chalk.gray('Starting workers on Heliactyl'))
  console.log(chalk.gray(`Master ${process.pid} is running`));
  console.log(chalk.gray(`Forking ${numCPUs} workers...`));

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  
  console.log(chalk.gray(`Successfully forked ${numCPUs} workers.`));
  console.log("")
  console.log(`|-| [- |_ | /\\ ( ~|~ \`/ |_`);
  console.log(`Heliactyl 24.0.0`);
  console.log(`Application started at port: ${settings.website.port}`)

  cluster.on('exit', (worker, code, signal) => {
    console.log(chalk.red(`Worker ${worker.process.pid} died. Forking a new worker...`));
    cluster.fork();
  });
} else {
  const express = require("express");
  const app = express();
  const session = require("express-session");
  const KeyvStore = require("./session");
  
  app.set('view engine', 'ejs');
  require("express-ws")(app);

  module.exports.app = app;

  app.use((req, res, next) => {
    res.setHeader("X-Powered-By", "Heliactyl 24.0.0");
    next();
  });

  app.use(session({
    store: new KeyvStore({ uri: settings.database }),
    secret: settings.website.secret,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
  }));

  app.use(express.json({
    inflate: true,
    limit: "500kb",
    strict: true,
    type: "application/json"
  }));

  app.listen(settings.website.port);

  // Rate limiting
  let cache = false;
  app.use((req, res, next) => {
    const manager = settings.api.client.ratelimits;
    const path = req._parsedUrl.pathname;
    
    if (manager[path]) {
      if (cache) {
        setTimeout(() => {
          const querystring = Object.entries(req.query)
            .map(([key, value]) => `${key}=${value}`)
            .join('&');
          res.redirect(`${path.startsWith('/') ? path : '/' + path}?${querystring}`);
        }, 1000);
        return;
      }
      cache = true;
      setTimeout(() => { cache = false; }, 1000 * manager[path]);
    }
    next();
  });

  // Load API routes
  fs.readdirSync("./api")
    .filter(file => file.endsWith(".js"))
    .forEach(file => {
      require(`./api/${file}`).load(app, db);
    });

  // Handle all other routes
  app.all("*", async (req, res) => {
    if (req.session.pterodactyl && 
        req.session.pterodactyl.id !== await db.get("users-" + req.session.userinfo.id)) {
      return res.redirect("/login?prompt=none");
    }

    const theme = module.exports.get(req);
    const newsettings = JSON.parse(fs.readFileSync("./settings.json"));

    if (newsettings.api.afk.enabled) {
      req.session.arcsessiontoken = Math.random().toString(36).substring(2, 15);
    }

    if (theme.settings.mustbeloggedin.includes(req._parsedUrl.pathname) && 
        (!req.session.userinfo || !req.session.pterodactyl)) {
      return res.redirect("/login" + (req._parsedUrl.pathname.startsWith('/') ? 
        "?redirect=" + req._parsedUrl.pathname.slice(1) : ""));
    }

    try {
      const data = await eval(module.exports.renderdataeval);
      const viewPath = theme.settings.pages[req._parsedUrl.pathname.slice(1)] || theme.settings.notfound;
      
      const str = await ejs.renderFile(`./views/${viewPath}`, data);
      delete req.session.newaccount;
      delete req.session.password;
      
      res.status(200).send(str);
    } catch (err) {
      console.error(err);
      res.render("500.ejs", { err });
    }
  });
}

module.exports.get = req => ({
  settings: fs.existsSync("./views/pages.json") 
    ? JSON.parse(fs.readFileSync("./views/pages.json").toString())
    : defaultthemesettings
});

module.exports.islimited = () => !cache;

module.exports.ratelimits = length => {
  if (cache) return setTimeout(module.exports.ratelimits, 1);
  cache = true;
  setTimeout(() => { cache = false; }, length * 1000);
};

// Global error handlers
process.on('uncaughtException', error => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
