
var Config = {};

Config.MAJOR_VERSION = 2;

Config.DOMAIN = "http://kitauji-gwent.club";

Config.SERVERS = {
  "aws": "ec2-13-113-243-171.ap-northeast-1.compute.amazonaws.com",
  "aliyun": "121.196.61.18",
  "local": "localhost",
}

Config.WebServer = {
  "port": 3000
};

Config.MONGODB_HOST = "localhost";

Config.Gwent = {
  notification_duration: 4000
};

(function (name, definition){
  if (typeof define === 'function'){ // AMD
    define(definition);
  } else if (typeof module !== 'undefined' && module.exports) { // Node.js
    module.exports = definition();
  } else { // Browser
    var theModule = definition(), global = this, old = global[name];
    theModule.noConflict = function () {
      global[name] = old;
      return theModule;
    };
    global[name] = theModule;
  }
})('Config', function () {
  return Config;
});