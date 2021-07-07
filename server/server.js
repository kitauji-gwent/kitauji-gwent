var http = require("http");
var express = require('express');
var favicon = require('serve-favicon');
var path = require('path');
var app = express();
var Config = require("../public/Config")
var DB = require("./dao/db");
var Cache = require("./dao/cache");

global.connections = require("./Connections")();
global.matchmaking = require("./Matchmaker")();
global.db = DB.getInstance();
Cache.getInstance().initialize();

global.Room = require("./Room");
global.User = require("./User");

var server = http.createServer(app);
global.io = require("socket.io")(server, {
  handlePreflightRequest: (req, res) => {
      const headers = {
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Allow-Origin": req.headers.origin, //or the specific origin you want to give access to,
          "Access-Control-Allow-Credentials": true
      };
      res.writeHead(200, headers);
      res.end();
  }
});
io.set('origins', '*:*');
server.listen(Config.WebServer.port);

console.info(`Please visit http://localhost:${Config.WebServer.port} to start playing`);
console.info(`请用浏览器访问 http://localhost:${Config.WebServer.port} 开始游戏（麻烦大家看到这句话，不要再来问我本地版怎么打开了（捂脸））`);

app.use(function(req, res, next) {
  res.setHeader("Content-Security-Policy-Report-Only", "default-src 'self'");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Credentials", true);
  return next();
});

app.use(express.static(__dirname + '/../public'));
app.use('/public', express.static(__dirname + '/../public'));
app.use('/assets', express.static(__dirname + '/../assets'));
app.use(favicon(path.join(__dirname, '/../assets/texture', 'favicon.ico')))

app.get("/version", function(req, res) {
  res.send(String(Config.MAJOR_VERSION));
});

app.get("/hosts", function(req, res) {
  res.json(Config.SERVERS);
});

var admin = io.of("/admin");

io.on("connection", function(socket) { //global connection
  socket.on("user:init", function(data) {
    let user = null;
    if (data.connId != null) {
      user = connections.findById(data.connId);
      if (user) {
        console.log("user ", user.getName(), " reconnect");
        try {
          user.reconnect(socket);
        } catch (e) {
          console.warn(e);
          user = null;
        }
      }
    }
    if (!user) {
      connections.add(user = User(socket, data.token));
    }

    socket.on("disconnect", function() {
      user.waitForReconnect();
    })


    io.emit("update:playerOnline", {
      online: connections.length(),
      idle: connections.getIdleUserCount(),
    });
  });

})

admin.on("connection", function(socket) {
  socket.on("sendMessage", function(msg) {
    console.log("admin send msg: " + msg);
    io.emit("notification", {
      msgKey: msg
    })
  })
})