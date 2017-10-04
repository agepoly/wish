/* jshint esversion: 6 */

var Datastore = require('nedb');
var email = require("emailjs");
var conf = require("./config.js");
var http = require('http');
var express = require('express');
require('./util/array_equal.js')();

/* HTTP server */
var app = express();
var server = http.createServer(app);

app.use(express.static(__dirname + '/static'));

app.get('/', function(req, res) {
    "use strict";
    res.sendFile(__dirname + '/static/home.html');
});

/* Database */
var db = {
    events: new Datastore({
        filename: 'events.db',
        autoload: true
    }),
    participants: new Datastore({
        filename: 'participants.db',
        autoload: true
    })
};
db.events.persistence.setAutocompactionInterval(24 * 3600 * 1000);
db.participants.persistence.setAutocompactionInterval(24 * 3600 * 1000);

/* Mailer */
var mailer = email.server.connect({
    user: conf.user,
    password: conf.password,
    host: conf.host,
    port: conf.port,
    ssl: true
});

/* io communication */
var io = require('socket.io')(server);

var connected_admins = [];

io.on('connection', function(socket) {
    "use strict";

    socket.on('disconnect', function() {
        for (var i = 0; i < connected_admins.length; ++i) {
            if (connected_admins[i].socket === socket) {
                connected_admins.splice(i, 1);
            }
        }
    });

    function feedback_error(err, found) {
        if (err !== null) {
            socket.emit('feedback', {
                title: "Oops...",
                text: "Something went wrong!\n[" + err + "]",
                type: "error"
            });
            return true;
        }
        if (found !== undefined && found === false) {
            socket.emit('feedback', {
                title: "Oops...",
                text: "Something went wrong!\n[key not found in the database]",
                type: "error"
            });
            return true;
        }
        return false;
    }

    require('./server/create.js')(socket, db, mailer, feedback_error);
    require('./server/wish.js')(socket, db, connected_admins, feedback_error);
    require('./server/admin.js')(socket, db, mailer, connected_admins, feedback_error);
    require('./server/history.js')(socket, db);
});

/* Run the server */
var serverPort = Number(process.argv[2]) || 3000;

server.listen(serverPort, function() {
    "use strict";
    console.log("listening on port " + serverPort);
});



/* for https
$ openssl genrsa 1024 > file.pem
$ openssl req -new -key file.pem -out csr.pem
$ openssl x509 -req -days 365 -in csr.pem -signkey file.pem -out file.crt
*/
/*
var fs = require('fs');
var https = require('https');
var options = {
    key: fs.readFileSync('./file.pem'),
    cert: fs.readFileSync('./file.crt')
};
var serverPort = 443;
var server = https.createServer(options, app);
*/
