/* jshint esversion: 6 */
//@ts-check

var Mustache = require('mustache');
var conf = require("../config.js");
var crypto = require("crypto");

module.exports = function (socket, db, mailer, connected_admins, feedback_error) {
    "use strict";

    function send_data(key, mailing_in_progress) {
        db.collection("events").findOne({ _id: key }, null, function (err, event) {
            if (feedback_error(err, event !== null)) { return; }

            db.collection("participants").find({ event: key }).toArray(function (err, participants) {
                // because participants can be removed in the event we have to filter
                participants = participants.filter(function (p) {
                    for (var i = 0; i < event.participants.length; ++i) {
                        if (event.participants[i] === p._id) return true;
                    }
                    return false;
                });
                participants.sort(function (p1, p2) {
                    return p1.mail < p2.mail ? -1 : 1;
                });
                socket.emit('get data', {
                    name: event.name,
                    slots: event.slots,
                    participants: participants
                }, mailing_in_progress);
            });
        });
    }

    socket.on('get data', function (key) {
        connected_admins.push({
            key: key,
            socket: socket
        });
        send_data(key, false);
    });

    socket.on('set data', function (content, send_mails) {
        console.log("set data(content = " + JSON.stringify(content) + ")");

        db.collection("events").findOne({ _id: content.key }, null, function (err, event) {
            if (feedback_error(err, event !== null)) { return; }
            var i;
            var vmin = 0,
                vmax = 0;
            for (i = 0; i < content.slots.length; ++i) {
                if (content.slots[i].vmin > content.slots[i].vmax) {
                    err = "vmin > vmax";
                }
                vmin += content.slots[i].vmin;
                vmax += content.slots[i].vmax;
            }
            if (content.participants.length > vmax || content.participants.length < vmin) {
                err = "amount of participants not in range [vmin, vmax]";
            }
            for (i = 0; i < content.participants.length; ++i) {
                if (content.participants[i].wish.length != content.slots.length) {
                    err = "size of wish not equal to amount of slots";
                }
            }
            if (err) {
                socket.emit('feedback', {
                    title: "Oops...",
                    text: "Something went wrong!\n[" + err + "]",
                    type: "error"
                });
                return;
            }

            var slots_changed = false;
            if (content.slots.length != event.slots.length) {
                slots_changed = true;
            } else {
                for (i = 0; i < content.slots.length; ++i) {
                    if (event.slots[i].name != content.slots[i].name) {
                        slots_changed = true;
                    }
                }
            }
            event.slots = content.slots;

            event.participants = []; // wipe and refill
            addParticipant(0);

            function addParticipant(i) {
                if (i < content.participants.length) {
                    db.collection("participants").findOne({
                        mail: content.participants[i].mail,
                        event: event._id
                    }, null, function (err, participant) {
                        if (feedback_error(err)) { return; }
                        if (participant === null) {
                            // create a new one
                            insert_participant();

                            function insert_participant() {
                                db.collection("participants").insertOne({
                                    _id: crypto.randomBytes(20).toString('hex'),
                                    mail: content.participants[i].mail,
                                    wish: content.participants[i].wish,
                                    event: event._id,
                                    status: 0 // 0 == mail not sent
                                }, function (err, res) {
                                    if (err !== null && err.code === 11000) {
                                        insert_participant();
                                        return;
                                    }
                                    if (feedback_error(err)) { return; }

                                    var newParticipant = res.ops[0];

                                    content.participants[i]._id = newParticipant._id;
                                    content.participants[i].status = newParticipant.status;

                                    event.participants.push(newParticipant._id);
                                    addParticipant(i + 1);
                                });
                            }
                        } else {
                            if (slots_changed && participant.status > 10) {
                                participant.status = 10; // 10 == update mail not sent
                            }

                            content.participants[i]._id = participant._id;
                            content.participants[i].status = participant.status;

                            event.participants.push(participant._id);
                            db.collection("participants").updateOne({ _id: participant._id }, {
                                $set: { wish: content.participants[i].wish, status: participant.status }
                            }, null, function (err, res) {
                                if (feedback_error(err, res.matchedCount === 1)) { return; }

                                addParticipant(i + 1);
                            });
                        }
                    });
                } else {
                    // all participants added
                    // event.slots and event.participants contain the fresh values
                    // content.participants contains the full&fresh participants values
                    db.collection("events").updateOne({ _id: event._id }, {
                        $set: {
                            participants: event.participants,
                            slots: event.slots
                        }
                    }, null, function (err, res) {
                        if (feedback_error(err, res.matchedCount === 1)) { return; }

                        var total_mails = 0;
                        var sent_mails = 0;
                        var errors = "";

                        if (send_mails) {
                            var first_mail = {
                                text: `Hi,
You have been invited by {{{amail}}} to give your wishes about the event : {{{name}}}
{{{message}}}

{{{url}}}/wish?{{{key}}}

Have a nice day,
The Wish team`,
                                html: `<p>Hi,</p>
<p>You have been invited by {{amail}} to give your wishes about the event : <strong>{{name}}</strong></p><br />
<pre>{{message}}</pre>
<p><a href="{{{url}}}/wish?{{{key}}}">Click here</a> to set your wishes.</p>
<p>Have a nice day,<br />
The Wish team</p>`
                            };
                            var recall_mail = {
                                text: `Hi,
The adimistrator ({{{amail}}}) of the event {{{name}}} has modified the slots.
Please look at your wish.

{{{url}}}/wish?{{{key}}}

Have a nice day,
The Wish team`,
                                html: `<p>Hi,</p>
<p>The adimistrator ({{amail}}) of the event <strong>{{name}}</strong> has modified the slots.</p>
<p>Please look at <a href="{{{url}}}/wish?{{{key}}}">your wish</a>.</p>
<p>Have a nice day,<br />
The Wish team</p>`
                            };

                            for (var j = 0; j < content.participants.length; ++j) {
                                var values = {
                                    amail: event.admin_mail,
                                    name: event.name,
                                    message: event.message,
                                    url: event.url,
                                    key: content.participants[j]._id
                                };

                                if (content.participants[j].status <= 0) { // 0 == mail not sent
                                    total_mails++;
                                    mailer.send({
                                        text: Mustache.render(first_mail.text, values),
                                        from: conf.mail,
                                        to: content.participants[j].mail,
                                        subject: "Wish : " + event.name,
                                        attachment: [{
                                            data: Mustache.render(first_mail.html, values),
                                            alternative: true
                                        }]
                                    }, check_mail(content.participants[j]._id, content.participants[j].mail));
                                } else if (content.participants[j].status <= 10) { // 10 == update not sent
                                    total_mails++;
                                    mailer.send({
                                        text: Mustache.render(recall_mail.text, values),
                                        from: conf.mail,
                                        to: content.participants[j].mail,
                                        subject: "Wish : " + event.name,
                                        attachment: [{
                                            data: Mustache.render(recall_mail.html, values),
                                            alternative: true
                                        }]
                                    }, check_mail(content.participants[j]._id, content.participants[j].mail));
                                }
                            }
                        }

                        if (total_mails > 0) {
                            socket.emit('feedback', {
                                title: "Mails status",
                                html: Mustache.render("{{sent}} over {{total}} mails sent !", {
                                    sent: sent_mails,
                                    total: total_mails
                                }),
                                type: "info",
                                showConfirmButton: false
                            });
                        } else {
                            socket.emit('feedback', {
                                title: "Saved",
                                html: "Information saved.",
                                type: "success"
                            });

                            send_data(content.key, false);
                        }

                        function check_mail(id, mail) {
                            return function (err, message) {
                                if (err) {
                                    errors += Mustache.render("<p>Error with <strong>{{mail}}</strong>: <i>{{error}}</i>", {
                                        mail: mail,
                                        error: String(err)
                                    });
                                    db.collection("participants").updateOne({ _id: id }, { $set: { status: -10 } }); // -10 == error mail
                                } else {
                                    sent_mails++;
                                    db.collection("participants").updateOne({ _id: id }, { $set: { status: 20 } }); // 20 == mail sent but no activity
                                }
                                if (errors) {
                                    socket.emit('feedback', {
                                        title: "Mails status",
                                        html: Mustache.render("<p>{{sent}} over {{total}} mails sent</p>{{{errors}}}", {
                                            sent: sent_mails,
                                            total: total_mails,
                                            errors: errors
                                        }),
                                        type: "error",
                                        showConfirmButton: true
                                    });
                                } else {
                                    socket.emit('feedback', {
                                        title: "Mails status",
                                        html: Mustache.render("{{sent}} over {{total}} mails sent !", {
                                            sent: sent_mails,
                                            total: total_mails
                                        }),
                                        type: sent_mails == total_mails ? "success" : "info",
                                        showConfirmButton: sent_mails == total_mails
                                    });
                                }
                                send_data(content.key, true);
                            };
                        }
                    });
                }
            }
        });
    });

    socket.on("send results", function (content) {
        console.log("send results(content = " + JSON.stringify(content) + ")");

        var mail = {
            text: `Hi,
You have been put in the slot {{{slot}}} for the event {{{event_name}}},

Have a nice day,
The Wish team`,
            html: `<p>Hi,</p>
<p>You have been put in the slot <strong>{{slot}}</strong> for the event <strong>{{event_name}}</strong>.</p>
<p>Have a nice day,<br />
The Wish team</p>`
        };

        var admin_mail = {
            text: `Hi,
The following information have been sent to the participants of the event {{event_name}}.

{{#result}}
{{mail}}  {{slot}}
{{/result}}

Have a nice day,
The Wish team`,
            html: `<p>Hi,</p>
<p>The following information have been sent to the participants of the event <strong>{{event_name}}</strong>.</p>

<table>
  <tr>
    <th>mail</th>
    <th>slot</th>
  </tr>
  {{#result}}
  <tr>
    <td>{{mail}}</td>
    <td>{{slot}}</td>
  </tr>
  {{/result}}
</table>

<p>Have a nice day,<br />
The Wish team</p>`
        };

        db.collection("events").findOne({ _id: content.key }, function (err, event) {
            if (feedback_error(err, event !== null)) { return; }
            var values;

            for (var i = 0; i < content.result.length; ++i) {
                values = {
                    slot: content.result[i].slot,
                    event_name: event.name,
                };
                mailer.send({
                    text: Mustache.render(mail.text, values),
                    from: conf.mail,
                    to: content.result[i].mail,
                    subject: "Wish : " + event.name,
                    attachment: [{
                        data: Mustache.render(mail.html, values),
                        alternative: true
                    }]
                }, check_mail(content.result[i].mail));
            }

            // send mail to admin
            values = {
                event_name: event.name,
                result: content.result,
            };

            mailer.send({
                text: Mustache.render(admin_mail.text, values),
                from: conf.mail,
                to: event.admin_mail,
                subject: "Wish : " + event.name,
                attachment: [{
                    data: Mustache.render(admin_mail.html, values),
                    alternative: true
                }]
            }, check_mail(event.admin_mail));

            var sent_mails = 0;
            var errors = "";

            function check_mail(mail) {
                return function (err, message) {
                    if (err) {
                        errors += Mustache.render("<p>Error with <strong>{{mail}}</strong>: <i>{{error}}</i>", {
                            mail: mail,
                            error: String(err)
                        });
                    } else {
                        sent_mails++;
                    }
                    if (errors) {
                        socket.emit('feedback', {
                            title: "Mails status",
                            html: Mustache.render("<p>{{sent}} over {{total}} mails sent</p>{{{errors}}}", {
                                sent: sent_mails,
                                total: content.result.length + 1,
                                errors: errors
                            }),
                            type: "error",
                            showConfirmButton: true
                        });
                    } else {
                        socket.emit('feedback', {
                            title: "Mails status",
                            html: Mustache.render("{{sent}} over {{total}} mails sent !", {
                                sent: sent_mails,
                                total: content.result.length + 1
                            }),
                            type: "success",
                            showConfirmButton: sent_mails == content.result.length + 1
                        });
                    }
                };
            }
        });
    });

    socket.on("remind", function (content) {
        console.log("remind(content = " + JSON.stringify(content) + ")");

        var mail = {
            text: `Hi,
Dont forget to fill your wish for the event {{{name}}},
{{{url}}}/wish?{{{key}}}

Have a nice day,
The Wish team`,
            html: `<p>Hi,</p>
<p>Dont forget to fill <a href="{{{url}}}/wish?{{{key}}}">your wish</a> for the event {{name}}.</p>
<p>Have a nice day,<br />
The Wish team</p>`
        };

        db.collection("events").findOne({ _id: content.key }, function (err, event) {
            if (feedback_error(err, event !== null)) { return; }
            // 30 == participant visited wish page
            db.collection("participants").find({ _id: { $in: event.participants }, status: { $lt: 35 } }).toArray(function (err, participants) {

                if (participants.length > 0) {
                    socket.emit('feedback', {
                        title: "Start to send mails",
                        text: "" + participants.length + " mails to send...",
                        type: "info",
                        showConfirmButton: false
                    });
                } else {
                    socket.emit('feedback', {
                        title: "No mails to send",
                        text: "All the participants have already fill their wishes.",
                    });
                }

                var sent_mails = 0;
                var errors = "";

                for (var i = 0; i < participants.length; ++i) {
                    var values = {
                        name: event.name,
                        url: event.url,
                        key: participants[i]._id
                    };
                    mailer.send({
                        text: Mustache.render(mail.text, values),
                        from: conf.mail,
                        to: participants[i].mail,
                        subject: "Wish : " + event.name,
                        attachment: [{
                            data: Mustache.render(mail.html, values),
                            alternative: true
                        }]
                    }, check_mail(participants[i]._id, participants[i].mail));
                }

                function check_mail(id, mail) {
                    return function (err, message) {
                        if (err) {
                            errors += Mustache.render("<p>Error with <strong>{{mail}}</strong>: <i>{{error}}</i>", {
                                mail: mail,
                                error: String(err)
                            });
                            db.collection("participants").updateOne({ _id: id }, { $set: { status: -10 } }); // -10 == mail error
                        } else {
                            sent_mails++;
                            // 20 == mail sent but no activity from participant
                            db.collection("participants").updateOne({ _id: id, status: { $lt: 20 } }, { $set: { status: 20 } });
                        }
                        if (errors) {
                            socket.emit('feedback', {
                                title: "Mails status",
                                html: Mustache.render("<p>{{sent}} over {{total}} mails sent</p>{{{errors}}}", {
                                    sent: sent_mails,
                                    total: participants.length,
                                    errors: errors
                                }),
                                type: "error",
                                showConfirmButton: true
                            });
                        } else {
                            socket.emit('feedback', {
                                title: "Mails status",
                                html: Mustache.render("{{sent}} over {{total}} mails sent !", {
                                    sent: sent_mails,
                                    total: participants.length
                                }),
                                type: "success",
                                showConfirmButton: sent_mails == participants.length
                            });
                        }
                    };
                }
            });
        });
    });
};
