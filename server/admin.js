/* jshint esversion: 6 */
var Mustache = require('mustache');
var conf = require("config");

module.exports = function(socket, db, mailer, connected_admins, feedback_error) {
    "use strict";

    function send_data(key) {
        db.events.findOne({ _id: key }, function(err, event) {
            if (feedback_error(err, event !== null)) { return; }
            db.participants.find({ event: key }, function(err, participants) {
                if (feedback_error(err)) { return; }

                // because participants can be removed in the event we have to filter
                participants = participants.filter(function(p) {
                    return event.participants.indexOf(p._id) !== -1;
                });
                participants.sort(function(p1, p2) {
                    return p1.mail < p2.mail ? -1 : 1;
                });
                socket.emit('get data', {
                    name: event.name,
                    slots: event.slots,
                    participants: participants
                });
            });
        });
    }
    
    socket.on('get data', function(key) {
        connected_admins.push({
            key: key,
            socket: socket
        });
        send_data(key);
    });

    socket.on('set data', function(content) {
        console.log("set data(content = " + JSON.stringify(content) + ")");

        db.events.findOne({ _id: content.key }, function(err, event) {
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
                    db.participants.findOne({
                        mail: content.participants[i].mail,
                        event: event._id
                    }, function(err, participant) {
                        if (feedback_error(err)) { return; }
                        if (participant === null) {
                            // create a new one
                            db.participants.insert({
                                mail: content.participants[i].mail,
                                wish: content.participants[i].wish,
                                event: event._id,
                                status: 0
                            }, function(err, newParticipant) {
                                if (feedback_error(err)) { return; }

                                content.participants[i]._id = newParticipant._id;
                                content.participants[i].status = newParticipant.status;

                                event.participants.push(newParticipant._id);
                                addParticipant(i + 1);
                            });
                        } else {
                            content.participants[i]._id = participant._id;
                            content.participants[i].status = participant.status;

                            event.participants.push(participant._id);
                            db.participants.update({ _id: participant._id }, {
                                $set: { wish: content.participants[i].wish }
                            }, function(err, numReplaced) {
                                if (feedback_error(err, numReplaced === 1)) { return; }

                                addParticipant(i + 1);
                            });
                        }
                    });
                } else {
                    // all participants added
                    // event.slots and event.participants contain the fresh values
                    // content.participants contains the full&fresh participants values
                    db.events.update({ _id: event._id }, {
                        $set: {
                            participants: event.participants,
                            slots: event.slots
                        }
                    }, function(err, numReplaced) {
                        if (feedback_error(err, numReplaced === 1)) { return; }

                        var first_mail = {
                            text: `Hi,
    You have been invited by {{{amail}}} to give your wishes about the event : {{{name}}}
    {{{message}}}

    {{{url}}}/wish.html#{{{key}}}

    Have a nice day,
    The Wish team`,
                            html: `<p>Hi,</p>
    <p>You have been invited by {{amail}} to give your wishes about the event : <strong>{{name}}</strong></p><br />
    <pre>{{message}}</pre>
    <p><a href="{{{url}}}/wish.html#{{{key}}}">Click here</a> to set your wishes.</p>
    <p>Have a nice day,<br />
    The Wish team</p>`
                        };
                        var recall_mail = {
                            text: `Hi,
    The adimistrator ({{{amail}}}) of the event {{{name}}} has modified the slots.
    Please look at your wish.

    {{{url}}}/wish.html#{{{key}}}

    Have a nice day,
    The Wish team`,
                            html: `<p>Hi,</p>
    <p>The adimistrator ({{amail}}) of the event <strong>{{name}}</strong> has modified the slots.</p>
    <p>Please look at <a href="{{{url}}}/wish.html#{{{key}}}">your wish</a>.</p>
    <p>Have a nice day,<br />
    The Wish team</p>`
                        };

                        var total_mails = 0;
                        var sent_mails = 0;
                        var errors = "";

                        for (var j = 0; j < content.participants.length; ++j) {
                            var values = {
                                amail: event.admin_mail,
                                name: event.name,
                                message: event.message,
                                url: event.url,
                                key: content.participants[j]._id
                            };

                            if (content.participants[j].status <= 0) {
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
                            } else if (slots_changed) {
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
                        }

                        function check_mail(id, mail) {
                            return function(err, message) {
                                if (err) {
                                    errors += Mustache.render("<p>Error with <strong>{{mail}}</strong>: <i>{{error}}</i>", {
                                        mail: mail,
                                        error: String(err)
                                    });
                                    db.participants.update({ _id: id }, { $set: { status: -1 } });
                                } else {
                                    sent_mails++;
                                    db.participants.update({ _id: id }, { $set: { status: 1 } });
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
                                send_data(content.key);
                            };
                        }
                    });
                }
            }
        });
    });

    socket.on("send results", function(content) {
        console.log("send results(content = " + JSON.stringify(content) + ")");

        var mail = {
            text: `Hi,
    You have been put in the slot {{{slot}}} for the event {{{event_name}}},

    Have a nice day,
    The Wish team`,
            html: `<p>Hi,</p>
    <p>You have been put in the slot {{slot}} for the event {{event_name}}.</p>
    <p>Have a nice day,<br />
    The Wish team</p>`
        };

        db.events.findOne({ _id: content.key }, function(err, event) {
            if (feedback_error(err, event !== null)) { return; }

            for (var i = 0; i < content.result.length; ++i) {
                var values = {
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

            var sent_mails = 0;
            var errors = "";

            function check_mail(mail) {
                return function(err, message) {
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
                                total: content.result.length,
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
                                total: content.result.length
                            }),
                            type: "success",
                            showConfirmButton: sent_mails == content.result.length
                        });
                    }
                };
            }
        });
    });

    socket.on("remind", function(content) {
        console.log("remind(content = " + JSON.stringify(content) + ")");

        var mail = {
            text: `Hi,
    Dont forget to fill your wish for the event {{{name}}},
    {{{url}}}/wish.html#{{{key}}}

    Have a nice day,
    The Wish team`,
            html: `<p>Hi,</p>
    <p>Dont forget to fill <a href="{{{url}}}/wish.html#{{{key}}}">your wish</a> for the event {{name}}.</p>
    <p>Have a nice day,<br />
    The Wish team</p>`
        };

        db.events.findOne({ _id: content.key }, function(err, event) {
            if (feedback_error(err, event !== null)) { return; }
            db.participants.find({ _id: { $in: event.participants }, status: { $lt: 3 } }, function(err, participants) {

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

                var sent_mails = 0;
                var errors = "";

                function check_mail(id, mail) {
                    return function(err, message) {
                        if (err) {
                            errors += Mustache.render("<p>Error with <strong>{{mail}}</strong>: <i>{{error}}</i>", {
                                mail: mail,
                                error: String(err)
                            });
                            db.participants.update({ _id: id }, { $set: { status: -1 } });
                        } else {
                            sent_mails++;
                            db.participants.update({ _id: id, status: { $lt: 1 } }, { $set: { status: 1 } });
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
