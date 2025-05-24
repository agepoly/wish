/* jshint esversion: 6 */

module.exports = function (socket, db, connected_admins, feedback_error) {
  "use strict";
  socket.on("get wish", function (key) {
    db.collection("participants").findOne(
      { _id: key },
      function (err, participant) {
        if (feedback_error(err, participant !== null)) {
          return;
        }

        db.collection("events").findOne(
          { _id: participant.event },
          function (err, event) {
            if (feedback_error(err, event !== null)) {
              return;
            }

            if (event.slots.length != participant.wish.length) {
              console.log(
                "error (event.slots.length != participant.wish.length) event = " +
                  JSON.stringify(event) +
                  " and participant = " +
                  JSON.stringify(participant),
              );
              participant.wish = [];
              for (let i = 0; i < event.slots.length; ++i) {
                participant.wish[i] = 0;
              }
            }

            socket.emit("get wish", {
              name: event.name,
              mail: participant.mail,
              slots: event.slots,
              wish: participant.wish,
            });
          },
        );
      },
    );
    // 30 == participant visited wish page
    db.collection("participants").updateOne(
      { _id: key, status: { $lt: 30 } },
      { $set: { status: 30 } },
    );
  });

  socket.on("set wish", function (content) {
    console.log("set wish(content = " + JSON.stringify(content) + ")");

    var sorted = content.wish.slice(0);
    sorted.sort(function (a, b) {
      return a - b;
    });
    for (var i = 0; i < sorted.length; ++i) {
      if (sorted[i] > i) {
        socket.emit("feedback", {
          title: "Oops...",
          html: "Something went wrong!<br />Your wish is <strong>unfair</strong>",
          type: "error",
        });
        return;
      }
    }

    db.collection("participants").findOne(
      { _id: content.key },
      function (err, participant) {
        if (feedback_error(err, participant !== null)) {
          return;
        }

        db.collection("events").findOne(
          { _id: participant.event },
          function (err, event) {
            if (feedback_error(err, event !== null)) {
              return;
            }

            if (event.slots.length != content.wish.length) {
              socket.emit("feedback", {
                title: "Oops...",
                html: "Something went wrong!<br /><strong>The amount of slots is invalid</strong><br />Maybe reload the page will fix the problem",
                type: "error",
              });
              return;
            }

            // 40 == participant modified his/her wish
            db.collection("participants").updateOne(
              { _id: content.key },
              { $set: { wish: content.wish, status: 40 } },
              {},
              function (err, res) {
                if (feedback_error(err, res.matchedCount === 1)) {
                  return;
                }

                socket.emit("feedback", {
                  title: "Saved",
                  text: "Your wish has been saved.",
                  type: "success",
                });

                if (res.modifiedCount === 1) {
                  for (var i = 0; i < connected_admins.length; ++i) {
                    if (connected_admins[i].key === participant.event) {
                      connected_admins[i].socket.emit(
                        "new wish",
                        participant.mail,
                      );
                    }
                  }
                }
              },
            );
          },
        );
      },
    );
  });
};
