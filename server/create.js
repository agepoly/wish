/* jshint esversion: 6 */
var Mustache = require('mustache');
var conf = require("../config.js");

module.exports = function(socket, db, mailer, feedback_error) {
    "use strict";
    socket.on('create', function(content) {
        var i;

        console.log("create(content = " + JSON.stringify(content) + ")");

        db.events.insert({
            name: content.name,
            admin_mail: content.admin_mail,
            slots: content.slots,
            url: content.url,
            message: content.message,
            participants: [],
            creation_time: +new Date()
        }, function(err, newEvent) {
            if (feedback_error(err)) { return; }

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
                if (feedback_error(err)) { return; }

                var ids = [];
                for (i = 0; i < newParticipants.length; ++i) {
                    ids[i] = newParticipants[i]._id;
                }

                db.events.update({ _id: newEvent._id }, { $set: { participants: ids }, }, {},
                    function(err, numReplaced) {
                        if (feedback_error(err, numReplaced === 1)) { return; }

                        socket.emit('feedback', {
                            title: 'Status',
                            html: Mustache.render('<ol><li>Request sent</li><li>Event created</li><li><strong>Waiting for sending mail to {{mail}}...</strong></li></ol>', { mail: content.admin_mail }),
                            showConfirmButton: false,
                            type: 'info'
                        });

                        mailer.send({
                            text: Mustache.render(`Hi,
An event has been created with your email address.
If you are not concerned, please do not click on the following url.
To administrate the activity, go to the following url : {{url}}/admin.html#{{key}}

Have a nice day,
The Wish team`, {
                                url: content.url,
                                key: newEvent._id
                            }),
                            from: conf.mail,
                            to: content.admin_mail,
                            subject: "Wish : " + content.name,
                            attachment: [{
                                data: Mustache.render(`<p>Hi,</p>
<p>An event has been created with your email address.<br />
<strong>If you are not concerned, please do not click on the following url.</strong><br />
<a href="{{url}}/admin.html#{{key}}">Click here</a> to administrate the activity.</p>

<p>Have a nice day,<br />
The Wish team</p>`, {
                                    url: content.url,
                                    key: newEvent._id
                                }),
                                alternative: true
                            }]
                        }, function(err, message) {
                            if (feedback_error(err)) { return; }

                            socket.emit('feedback', {
                                title: "Status",
                                html: Mustache.render('<ol><li>Request sent</li><li>Event created</li><li>Mail sent</li></ol>A mail has been sent to {{mail}} to validate the activity.', { mail: content.admin_mail }),
                                type: "success"
                            });
                        });
                    });
            });
        });
    });
};
