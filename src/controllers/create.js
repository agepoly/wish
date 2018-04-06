/* jshint esversion: 6 */
//@ts-check

// @ts-ignore
var Mustache = require('mustache');
// @ts-ignore
var conf = require("../config.js");
// @ts-ignore
var crypto = require("crypto");

// @ts-ignore
module.exports = function (socket, db, mailer, feedback_error) {
    "use strict";
    socket.on('create', function (content) {
        /** @type {number} */
        var i;

        console.log("create(content = " + JSON.stringify(content) + ")");

        insert_event();
        function insert_event() {
            db.collection("events").insertOne({
                _id: crypto.randomBytes(20).toString('hex'),
                name: content.name,
                admin_mail: content.admin_mail,
                slots: content.slots,
                url: content.url,
                message: content.message,
                participants: [],
                creation_time: +new Date()
            }, function (err, res) {
                if (err !== null && err.code === 11000) {
                    insert_event();
                    return;
                }

                if (feedback_error(err)) { return; }

                var wish = [];
                for (i = 0; i < content.slots.length; ++i) {
                    wish[i] = 0;
                }

                var newEvent = res.ops[0];

                insert_participants();

                function insert_participants() {
                    var participants = [];
                    for (i = 0; i < content.mails.length; ++i) {
                        participants[i] = {
                            _id: crypto.randomBytes(20).toString('hex'),
                            mail: content.mails[i],
                            wish: wish,
                            event: newEvent._id,
                            status: 0
                        };
                    }

                    db.collection("participants").insertMany(participants, function (err, res) {
                        if (err !== null && err.code === 11000) {
                            insert_participants();
                            return;
                        }

                        if (feedback_error(err)) { return; }

                        var newParticipants = res.ops;

                        var ids = [];
                        for (i = 0; i < newParticipants.length; ++i) {
                            ids[i] = newParticipants[i]._id;
                        }

                        db.collection("events").updateOne({ _id: newEvent._id }, { $set: { participants: ids }, }, {},
                            function (err, res) {
                                if (feedback_error(err, res.modifiedCount === 1)) { return; }

                                socket.emit('feedback', {
                                    title: 'Status',
                                    html: Mustache.render(
                                        '<ol><li>Request sent</li><li>Event created</li><li><strong>Waiting for sending mail to {{mail}}...</strong></li></ol>',
                                        { mail: content.admin_mail }),
                                    showConfirmButton: false,
                                    type: 'info'
                                });

                                mailer.send({
                                    text: Mustache.render(`Hi,
An event has been created with your email address.
If you are not concerned, please do not click on the following url.
To administrate the activity, go to the following url : {{url}}/admin#{{key}}

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
<a href="{{url}}/admin#{{key}}">Click here</a> to administrate the activity.</p>

<p>Have a nice day,<br />
The Wish team</p>`, {
                                                url: content.url,
                                                key: newEvent._id
                                            }),
                                        alternative: true
                                    }]
                                }, function (err, message) {
                                    if (feedback_error(err)) { return; }

                                    socket.emit('feedback', {
                                        title: "Status",
                                        html: Mustache.render(
                                            '<ol><li>Request sent</li><li>Event created</li><li>Mail sent</li></ol>A mail has been sent to {{mail}} to validate the activity.',
                                            { mail: content.admin_mail }),
                                        type: "success"
                                    });
                                });
                            });
                    });
                }
            });
        }
    });
};
