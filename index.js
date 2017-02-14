/* jshint esversion: 6 */

var Mustache = require('mustache');
var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var email = require("emailjs");
var conf = require("config");
var Datastore = require('nedb');


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

var mailer = email.server.connect({
    user: conf.user,
    password: conf.password,
    host: conf.host,
    port: conf.port,
    ssl: true
});

app.use(express.static(__dirname + '/static'));

app.get('/', function(req, res) {
    "use strict";
    res.sendFile(__dirname + '/static/home.html');
});

io.on('connection', function(socket) {
    "use strict";
    console.log('a user connected');

    socket.on('disconnect', function() {
        console.log('user disconnected');
    });

    /* ============================= creation ============================= */
    socket.on('create', function(content) {
        var i;
        console.log(content);

        db.events.insert({
            name: content.name,
            admin_mail: content.admin_mail,
            slots: content.slots,
            url: content.url,
            message: content.message,
            participants: []
        }, function(err, newEvent) {
            if (err !== null) {
                socket.emit('feedback', {
                    title: "Oops...",
                    message: "Something went wrong!\n[" + err + "]",
                    type: "error"
                });
                return;
            }

            var wish = [];
            for (i = 0; i < content.slots.length; ++i) {
                wish[i] = 0;
            }

            var participants = [];
            for (i = 0; i < content.mails.length; ++i) {
                participants[i] = {
                    mail: content.mails[i],
                    wish: wish,
                    event: newEvent._id,
                    status: 0
                };
            }

            db.participants.insert(participants, function(err, newParticipants) {
                if (err !== null) {
                    socket.emit('feedback', {
                        title: "Oops...",
                        message: "Something went wrong!\n[" + err + "]",
                        type: "error"
                    });
                    return;
                }
                var ids = [];
                for (i = 0; i < newParticipants.length; ++i) {
                    ids[i] = newParticipants[i]._id;
                }

                db.events.update({
                    _id: newEvent._id
                }, {
                    $set: {
                        participants: ids
                    },
                }, {}, function(err, numReplaced) {
                    if (err) {
                        socket.emit('feedback', {
                            title: "Oops...",
                            message: "Something went wrong!\n[" + err + "]",
                            type: "error"
                        });
                        return;
                    }
                    mailer.send({
                        text: Mustache.render(`Hi,
An event has been created with your email address.
If you are not concerned, please do not click on the following url.
To administrate the activity, go to the following url : {{url}}/admin.html#{{key}}
The first time that this administration page is opened, the invitation mails are sent to the participants.

Have a nice day,
The Wish team`, {
                            url: content.url,
                            key: newEvent._id
                        }),
                        from: "Wish <wish@epfl.ch>",
                        to: content.admin_mail,
                        subject: "Wish : " + content.name,
                        attachment: [{
                            data: Mustache.render(`<p>Hi,</p>
<p>An event has been created with your email address.<br />
<strong>If you are not concerned, please do not click on the following url.</strong><br />
<a href="{{url}}/admin.html#{{key}}">Click here</a> to administrate the activity.
The first time that this administration page is opened,
the invitation mails are sent to the participants.</p>

<p>Have a nice day,<br />
The Wish team</p>`, {
                                url: content.url,
                                key: newEvent._id
                            }),
                            alternative: true
                        }]
                    }, function(err, message) {
                        if (err) {
                            socket.emit('feedback', {
                                title: "Oops...",
                                message: "Something went wrong!\n[" + err + "]",
                                type: "error"
                            });
                            return;
                        }
                        socket.emit('feedback', {
                            title: "Creation succeed!",
                            message: "A mail has been sent to " + content.admin_mail + " to validate the activity.",
                            type: "success"
                        });
                    });
                });
            });
        });
    });

    /* ============================= wish ============================= */
    socket.on('get wish', function(key) {
        db.participants.findOne({
            _id: key
        }, function(err, participant) {
            if (err) {
                socket.emit('feedback', {
                    title: "Oops...",
                    message: "Something went wrong!\n[" + err + "]",
                    type: "error"
                });
                return;
            }
            db.events.findOne({
                _id: participant.event
            }, function(err, event) {
                if (err) {
                    socket.emit('feedback', {
                        title: "Oops...",
                        message: "Something went wrong!\n[" + err + "]",
                        type: "error"
                    });
                    return;
                }
                socket.emit('get wish', {
                    name: event.name,
                    mail: participant.mail,
                    slots: event.slots,
                    wish: participant.wish,
                });
            });
        });
        db.update({
            _id: key,
            status: { $lte: 1 } // 0=not send, 1=send
        }, {
            $set: {
                status: 2 // =view
            }
        });
    });

    socket.on('set wish', function(content) {
        var sorted = content.wish.slice(0);
        sorted.sort();
        for (var i = 0; i < sorted.length; ++i) {
            if (sorted[i] > i) {
                socket.emit('feedback', {
                    title: "Oops...",
                    message: "Something went wrong!\n[unfair wish]",
                    type: "error"
                });
                return;
            }
        }

        db.participants.update({
            _id: content.key
        }, {
            $set: {
                wish: content.wish
            }
        }, {}, function(err, numReplaced) {
            if (err) {
                socket.emit('feedback', {
                    title: "Oops...",
                    message: "Something went wrong!\n[" + err + "]",
                    type: "error"
                });
            } else if (numReplaced === 0) {
                socket.emit('feedback', {
                    title: "Oops...",
                    message: "Something went wrong!\n[key not found in the database]",
                    type: "error"
                });
            } else {
                db.update({
                    _id: content.key
                }, {
                    $set: {
                        status: 3 // =modified
                    }
                });
                socket.emit('feedback', {
                    title: "Saved",
                    message: "Your wish as been saved.",
                    type: "success"
                });
                io.emit('wishes modified');
            }
        });
    });
    /* ============================= admin ============================= */
    socket.on('get data', function(key) {
        db.events.findOne({
            _id: key
        }, function(err, event) {
            if (err) {
                socket.emit('feedback', {
                    title: "Oops...",
                    message: "Something went wrong!\n[" + err + "]",
                    type: "error"
                });
            } else if (event === null) {
                socket.emit('feedback', {
                    title: "Oops...",
                    message: "Something went wrong!\n[key not found in the database]",
                    type: "error"
                });
            } else {
                db.participants.find({
                    event: key
                }, function(err, participants) {
                    if (err) {
                        socket.emit('feedback', {
                            title: "Oops...",
                            message: "Something went wrong!\n[" + err + "]",
                            type: "error"
                        });
                        return;
                    }
                    var wishes = [];
                    var status = [];
                    var mails = [];
                    for (var i = 0; i < event.participants.length; ++i) {
                        var id = event.participants[i];
                        for (var j = 0; j < participants.length; ++j) {
                            if (participants[j]._id == id) {
                                wishes[i] = participants[j].wish;
                                status[i] = participants[j].status;
                                mails[i] = participants[j].mail;
                                break;
                            }
                        }
                    }
                    socket.emit('get data', {
                        name: event.name,
                        slots: event.slots,
                        mails: mails,
                        status: status,
                        wishes: wishes
                    });
                });
            }
        });
    });

    socket.on('set data', function(content) {

        //TODO send mails to participants according to status content
        // 0=not send
        // 1=send
        socket.emit('info', 'mail sent to <...>');

    });
});

http.listen(3000, function() {
    "use strict";
    console.log('listening on *:3000');
});
