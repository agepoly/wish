var SOCKET = io();
var INPUT_CODE, OUTPUT_CODE;
var FIRST_CALL = true;
var RESULT = null;

SOCKET.on('feedback', swal);

SOCKET.on("get data", function(content) {
    "use strict";

    var code = into_code(content);
    INPUT_CODE.setValue(code);

    document.getElementById("name").innerHTML = Mustache.render("Event name: <strong>{{name}}</strong>", {
        name: content.name
    });

    if (FIRST_CALL && content.participants.some(function(p) { return p.status === 0; })) {
        swal({
            title: "Mails ready to be sent",
            html: "Do you want to send the invitation mails to the participants right now ?<br />Otherwise you can do it later by clicking on <strong>Save &amp; Send mails</strong>.",
            type: "info",
            showCancelButton: true,
            confirmButtonText: "Send the mails",
            cancelButtonText: "Later"
        }).then(function() {
            SOCKET.emit('set data', {
                key: window.location.hash.substring(1),
                slots: content.slots,
                participants: content.participants
            });
        }, function(dismiss) {});
    }
    FIRST_CALL = false;
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
        var out = parse(text);
        return out.errors.concat(out.warnings);
    });

    INPUT_CODE = CodeMirror.fromTextArea(document.getElementById('input'), {
        lineNumbers: true,
        mode: "csv",
        gutters: ["CodeMirror-lint-markers"],
        lint: true
    });

    OUTPUT_CODE = CodeMirror.fromTextArea(document.getElementById('output'), {
        lineNumbers: true,
        mode: "csv",
        readOnly: true
    });

    document.getElementById("save").onclick = function() {
        var out = parse(INPUT_CODE.getValue());

        if (out.errors.length > 0) {
            INPUT_CODE.focus();
            INPUT_CODE.setCursor(out.errors[0].from);
        } else {
            SOCKET.emit('set data', {
                key: window.location.hash.substring(1),
                slots: out.slots,
                participants: out.participants
            });
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
                text: "Click on Assign to compute the results",
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
    var result = assign_hugarian(cost, content.slots, perm);

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
