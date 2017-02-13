var socket = io();
var x = null;

socket.on("get data", function(content) {
    "use strict";
    console.log(content);
    x = content;
    if (document.readyState != 'loading') {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }
});

socket.on('feedback', function(content) {
    "use strict";
    swal(content.title, content.message, content.type);
    document.getElementById('save').value = "Save";
});

socket.emit("get data", window.location.hash.substring(1));

function init() {
    "use strict";
    var i, j;
    document.getElementById("save").onclick = function() {
        socket.emit('set data', {
            key: window.location.hash.substring(1),
            mails: x.mails,
            slots: x.slots,
            wishes: x.wishes
        });
    };
    document.getElementById("name").innerHTML = x.name;

    CodeMirror.defineMode("csv", function() {
        return {
            startState: function() {
                return {
                    commentLine: false,
                    string: false,
                    section: false
                };
            },
            token: function(stream, state) {
                if (stream.sol()) {
                    state.commentLine = false;
                }
                var ch = stream.next().toString();
                if (state.commentLine) {
                    return "comment";
                }
                if (state.string) {
                    if (ch === '"') {
                        state.string = false;
                    }
                    return "string";
                }
                if (state.section) {
                    if (ch === ']') {
                        state.section = false;
                    }
                    return "keyword";
                }
                if (ch === "#") {
                    state.commentLine = true;
                    return "comment";
                }
                if (ch === '"') {
                    state.string = true;
                    return "string";
                }
                if (ch === '[') {
                    state.section = true;
                    return "keyword";
                }
                return "atom";
            }
        };
    });

    CodeMirror.registerHelper("lint", "csv", function(text) {
        return [];
    });

    var inputCode = CodeMirror.fromTextArea(document.getElementById('input'), {
        lineNumbers: true,
        mode: "csv",
        gutters: ["CodeMirror-lint-markers"],
        lint: true
    });

    var outputCode = CodeMirror.fromTextArea(document.getElementById('output'), {
        lineNumbers: true,
        mode: "csv",
        readOnly: true
    });

    inputCode.on("change", function() {
        // execute timer and compute results
    });

    var code = "[tasks]\n";
    for (i = 0; i < x.slots.length; ++i) {
        code += '"'+x.slots[i]+'" '+x.vmin[i]+' '+x.vmax[i]+'\n';
    }

    code += "\n[participants]";
    for (i = 0; i < x.mails.length; ++i) {
        code += '\n"'+x.mails[i]+'"';
        for (j = 0; j < x.wishes[i].length; ++j) {
            code += ' '+x.wishes[i][j];
        }
        code += ' # ';
        if (x.sent[i] === 0) {
            code += "error with the mail";
        } else if (x.sent[i] === 1) {
            code += "mail sent";
        } else {
            code += "modified by the user";
        }
    }

    inputCode.setValue(code);
}
