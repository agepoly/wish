/* jshint esversion: 6 */
var Mustache = require('mustache');
var conf = require("../config.js");

module.exports = function(socket, db) {
    "use strict";

    socket.on("ask history", function(password) {
        if (password != conf.history_password) {
            return;
        }
        db.events.find({}).sort({
            creation_time: -1
        }).exec(function(err, events) {
            var i;
            var text = "<ul>";
            for (i = 0; i < events.length; ++i) {
                text += Mustache.render("<li><a href=\"{{{url}}}/admin.html#{{{key}}}\"><strong>{{name}}</strong></a> (admin: {{mail}}, {{nparticipants}} participants): {{message}}</li>", {
                    name: events[i].name,
                    mail: events[i].admin_mail,
                    message: events[i].message,
                    nparticipants: events[i].participants.length,
                    url: events[i].url,
                    key: events[i]._id
                });
            }
            text += "</ul>";
            socket.emit('get history', text);
        });
    });
};
