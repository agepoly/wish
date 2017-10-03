/* jshint esversion: 6 */
module.exports = function(socket, db, connected_admins, feedback_error) {
    "use strict";
    socket.on('get wish', function(key) {
        db.participants.findOne({ _id: key }, function(err, participant) {
            if (feedback_error(err, participant !== null)) { return; }

            db.events.findOne({ _id: participant.event }, function(err, event) {
                if (feedback_error(err, event)) { return; }

                if (event.slots.length != participant.wish.length) {
                    console.log("error (event.slots.length != participant.wish.length) event = " + JSON.stringify(event) + " and participant = " + JSON.stringify(participant));
                    participant.wish = [];
                    for (i = 0; i < event.slots.length; ++i) {
                        participant.wish[i] = 0;
                    }
                }

                socket.emit('get wish', {
                    name: event.name,
                    mail: participant.mail,
                    slots: event.slots,
                    wish: participant.wish,
                });
            });
        });
        db.participants.update({ _id: key, status: { $lte: 1 } }, { $set: { status: 2 } });
    });

    socket.on('set wish', function(content) {
        console.log("set wish(content = " + JSON.stringify(content) + ")");

        var sorted = content.wish.slice(0);
        sorted.sort(function(a, b) { return a - b; });
        for (var i = 0; i < sorted.length; ++i) {
            if (sorted[i] > i) {
                socket.emit('feedback', {
                    title: "Oops...",
                    html: "Something went wrong!<br />Your wish is <strong>unfair</strong>",
                    type: "error"
                });
                return;
            }
        }

        db.participants.findOne({ _id: content.key }, function(err, participant) {
            if (feedback_error(err)) { return; }

            db.events.findOne({ _id: participant.event }, function(err, event) {
                if (feedback_error(err)) { return; }

                if (event.slots.length != content.wish.length) {
                    socket.emit('feedback', {
                        title: "Oops...",
                        html: "Something went wrong!<br /><strong>The amount of slots is invalid</strong><br />Maybe reload the page will fix the problem",
                        type: "error"
                    });
                    return;
                }

                db.participants.update({ _id: content.key }, { $set: { wish: content.wish, status: 3 } }, {}, function(err, numReplaced) {
                    if (feedback_error(err, numReplaced === 1)) { return; }

                    socket.emit('feedback', {
                        title: "Saved",
                        text: "Your wish has been saved.",
                        type: "success"
                    });
                });

                if (participant.wish.equals(content.wish) === false) {
                    for (var i = 0; i < connected_admins.length; ++i) {
                        if (connected_admins[i].key === participant.event) {
                            connected_admins[i].socket.emit('new wish', participant.mail);
                        }
                    }
                }
            });
        });
    });
};
