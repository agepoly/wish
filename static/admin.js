var SOCKET = io();
var INPUT_CODE, OUTPUT_CODE;
var RESULT = null;

function when_swal_is_ready(fun) {
    "use strict";
    if (swal.isVisible()) {
        setTimeout(function() {
            when_swal_is_ready(fun);
        }, 500);
    } else {
        fun();
    }
}

SOCKET.on('feedback', swal);

SOCKET.on("get data", function(content, mailing_in_progress) {
    "use strict";

    var code = into_code(content);
    INPUT_CODE.setValue(code);

    RESULT = null;
    OUTPUT_CODE.setValue("");

    document.getElementById("name").innerHTML = Mustache.render("Event name: <strong>{{name}}</strong>", {
        name: content.name
    });

    // 0 == new users
    // 10 == update mail not sent
    if (!mailing_in_progress && content.participants.some(function(p) {
            return p.status <= 10;
        })) {
        var mails_error = content.participants.filter(function(p) {
            return p.status < 0;
        }).map(function(p) {
            return p.mail;
        });
        var mails_new = content.participants.filter(function(p) {
            return p.status >= 0 && p.status < 10;
        }).map(function(p) {
            return p.mail;
        });
        var mails_update = content.participants.filter(function(p) {
            return p.status == 10;
        }).map(function(p) {
            return p.mail;
        });

        var to_who = "";
        if (mails_error.length > 0) {
            to_who += Mustache.render("<br />Due to previous errors: {{mail}}", {
                mail: mails_error.join(", ")
            });
        }
        if (mails_new.length > 0) {
            to_who += Mustache.render("<br />New users: {{mail}}", {
                mail: mails_new.join(", ")
            });
        }
        if (mails_update.length > 0) {
            to_who += Mustache.render("<br />Update mail: {{mail}}", {
                mail: mails_update.join(", ")
            });
        }

        when_swal_is_ready(function() {
            swal({
                title: "Mails ready to be sent",
                html: to_who,
                type: "info",
                showCancelButton: true,
                confirmButtonText: "Send the mails",
                cancelButtonText: "Later"
            }).then(function() {
                SOCKET.emit('set data', {
                    key: window.location.hash.substring(1),
                    slots: content.slots,
                    participants: content.participants
                }, true);
            }, function(dismiss) {});
        });
    }
});

if (document.readyState != 'loading') {
    initDOM();
} else {
    document.addEventListener('DOMContentLoaded', initDOM);
}

function initDOM() {
    "use strict";
    CodeMirror.defineMode("csv", csv_mode_for_code_mirror);

    CodeMirror.registerHelper("lint", "csv", function(text) {
        var start_time = new Date().getTime();
        var out = parse(text);
        var dt = new Date().getTime() - start_time;

        console.log("Lint " + String(dt) + " ms");

        return out.errors.concat(out.warnings);
    });

    INPUT_CODE = CodeMirror.fromTextArea(document.getElementById('input'), {
        lineNumbers: false,
        scrollbarStyle: "null",
        viewportMargin: Infinity,
        lineWrapping: true,
        mode: "csv",
        gutters: ["CodeMirror-lint-markers"],
        lint: true,
        theme: 'wish'
    });

    OUTPUT_CODE = CodeMirror.fromTextArea(document.getElementById('output'), {
        lineNumbers: false,
        scrollbarStyle: "null",
        viewportMargin: Infinity,
        lineWrapping: true,
        mode: "csv",
        readOnly: true,
        theme: 'wish'
    });

    document.getElementById("save").onclick = function() {
        var out = parse(INPUT_CODE.getValue());

        if (out.errors.length > 0) {
            var error = out.errors[0];

            swal({
                title: "Error",
                html: Mustache.render("At line {{line}}: {{message}}", {
                    line: error.from.line,
                    message: error.message
                }),
                type: "error",
            }).then(function() {
                INPUT_CODE.focus();
                INPUT_CODE.setCursor(out.errors[0].from);
            });
        } else {
            SOCKET.emit('set data', {
                key: window.location.hash.substring(1),
                slots: out.slots,
                participants: out.participants
            }, false);
        }
    };
    document.getElementById("remind").onclick = function() {
        SOCKET.emit('remind', {
            key: window.location.hash.substring(1)
        });
    };
    document.getElementById("assign").onclick = function() {
        var out = parse(INPUT_CODE.getValue());

        if (out.errors.length > 0) {
            INPUT_CODE.focus();
            INPUT_CODE.setCursor(out.errors[0].from);
        } else {
            assign(out);
        }
    };
    document.getElementById("send").onclick = function() {
        if (RESULT === null) {
            swal({
                title: "No results to send",
                text: "Click on Compute Assignation to compute the results",
                type: "error",
            });
        } else {
            SOCKET.emit('send results', {
                key: window.location.hash.substring(1),
                result: RESULT
            });
        }
    };

    var warning_text = document.getElementById("warning").innerHTML;
    SOCKET.on("new wish", function(mail) {
        var p = document.getElementById("warning");
        p.innerHTML = Mustache.render(warning_text, {
            mail: mail
        });
        p.hidden = false;
    });

    SOCKET.emit("get data", window.location.hash.substring(1));
}

function assign(content) {
    "use strict";
    var i;

    var perm = permutation(content.participants.length);
    var cost = cost_matrix(content, perm);
    var result = assign_hugarian(cost, content, perm);

    RESULT = [];
    for (i = 0; i < result.length; ++i) {
        RESULT[i] = {
            mail: content.participants[i].mail,
            slot: content.slots[result[i]].name
        };
    }

    var text = result_into_text(content, result);
    OUTPUT_CODE.setValue(text);
}
