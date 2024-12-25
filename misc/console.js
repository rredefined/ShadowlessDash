const chalk = require("chalk");

function timestamp(date, includeTime) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (!includeTime) {
    return `${date.getDate().toString().padStart(2, '0')}-${months[date.getMonth()]}-${date.getFullYear()}`;
  }
  return `${date.getDate().toString().padStart(2, '0')}-${months[date.getMonth()]}-${date.getFullYear()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}
function logWithInfo() {
  const originalLog = console.log;
  console.log = function (...args) {
    originalLog(chalk.gray(`[${timestamp(new Date(), true)}]`), ...args);
  };
}

module.exports = logWithInfo;
