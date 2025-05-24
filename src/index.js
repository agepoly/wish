/* jshint esversion: 6 */

var MongoClient = require("mongodb").MongoClient;
var Logger = require("mongodb").Logger;
var email = require("emailjs");
var conf = require("./config.js");
var http = require("http");
var express = require("express");
require("./util/array_equal.js")();

/* HTTP server */
var app = express();
var server = http.createServer(app);

app.use(express.static(__dirname + "/public"));

app.get("/", function (req, res) {
  "use strict";
  res.sendFile(__dirname + "/public/html/home.html");
});

app.get("/admin(.html)?", function (req, res) {
  "use strict";
  res.sendFile(__dirname + "/public/html/admin.html");
});

app.get("/wish(.html)?", function (req, res) {
  "use strict";
  res.sendFile(__dirname + "/public/html/wish.html");
});

app.get("/help(.html)?", function (req, res) {
  "use strict";
  res.sendFile(__dirname + "/public/html/help.html");
});

app.get("/history(.html)?", function (req, res) {
  "use strict";
  res.sendFile(__dirname + "/public/html/history.html");
});

app.get("/offline(.html)?", function (req, res) {
  "use strict";
  res.sendFile(__dirname + "/public/html/offline.html");
});

/* Mailer */
var SMTPClient = email.SMTPClient;
var mailer = new SMTPClient({
  user: conf.user,
  password: conf.password,
  host: conf.host,
  port: conf.port,
  ssl: true,
});

/* io communication */
var { Server } = require("socket.io");
var io = new Server(server);

var connected_admins = [];

var db;

io.on("connection", function (socket) {
  "use strict";

  socket.on("disconnect", function () {
    for (var i = 0; i < connected_admins.length; ++i) {
      if (connected_admins[i].socket === socket) {
        connected_admins.splice(i, 1);
      }
    }
  });

  function feedback_error(err, found) {
    if (err !== null) {
      socket.emit("feedback", {
        title: "Oops...",
        text: "Something went wrong!\n[" + err + "]",
        type: "error",
      });
      return true;
    }
    if (found !== undefined && found === false) {
      socket.emit("feedback", {
        title: "Oops...",
        text: "Something went wrong!\n[key not found in the database]",
        type: "error",
      });
      return true;
    }
    return false;
  }

  require("./controllers/create.js")(socket, db, mailer, feedback_error);
  require("./controllers/wish.js")(
    socket,
    db,
    connected_admins,
    feedback_error,
  );
  require("./controllers/admin.js")(
    socket,
    db,
    mailer,
    connected_admins,
    feedback_error,
  );
  require("./controllers/history.js")(socket, db);
});

MongoClient.connect(
  conf.mongodb_url,
  { useUnifiedTopology: true },
  (err, client) => {
    "use strict";
    if (err) return console.log(err);
    db = client.db("wish");

    Logger.setLevel("debug");
    Logger.filter("class", ["Db"]);

    /* Run the server */
    var serverPort = Number(process.argv[2]) || 3000;

    server.listen(serverPort, function () {
      console.log("listening on port " + serverPort);
    });
  },
);
