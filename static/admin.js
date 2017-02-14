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
    document.getElementById("name").innerHTML = x.name;

    CodeMirror.defineMode("csv", function() {
        return {
            startState: function() {
                return {
                    commentLine: false,
                    string: false,
                    section: false,
                    error: false
                };
            },
            token: function(stream, state) {
                if (stream.sol()) {
                    state.commentLine = false;
                    if (state.string) {
                        state.error = true;
                    }
                }
                var ch = stream.next().toString();
                if (state.error) {
                    return "error";
                }
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
        var out = parse(text);
        console.log(out);
        return out.errors;
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

    inputCode.on("change", function() {});

    document.getElementById("save").onclick = function() {
        var out = parse(inputCode.getValue());

        if (!out.ok) {
            inputCode.focus();
            inputCode.setCursor(out.errors[0].from);
        } else {
            var mails = [];
            var wishes = [];
            for (i = 0; i < out.participants.length; ++i) {
                mails[i] = out.participants[i].mail;
                wishes[i] = out.participants[i].wish;
            }
            socket.emit('set data', {
                key: window.location.hash.substring(1),
                mails: mails,
                tasks: out.tasks,
                wishes: wishes
            });
        }
    };

    var code = "[tasks]\n";
    var tasks = [];
    for (i = 0; i < x.slots.length; ++i) {
        tasks[i] = ['"' + x.slots[i] + '"', String(x.vmin[i]), String(x.vmax[i])];
    }
    code += format_columns(tasks);

    code += "\n[participants]\n";
    var participants = [];
    for (i = 0; i < x.mails.length; ++i) {
        participants[i] = ['"' + x.mails[i] + '"'];
        for (j = 0; j < x.wishes[i].length; ++j) {
            participants[i].push(String(x.wishes[i][j]));
        }
        switch (x.status[i]) {
            case -1:
                code += participants[i].push("# mail error");
                break;
            case 0:
                // mail not sent
                break;
            case 1:
                code += participants[i].push("# no activity");
                break;
            case 2:
                code += participants[i].push("# view");
                break;
            case 3:
                code += participants[i].push("# modified");
                break;
            default:
                code += participants[i].push("# [status error]");
        }
    }
    code += format_columns(participants);

    inputCode.setValue(code);
}

function format_columns(matrix) {
    "use strict";
    if (matrix.length === 0) {
        return "";
    }
    var i, j, k;
    var max_len = [];
    for (i = 0; i < matrix.length; ++i) {
        for (j = 0; j < matrix[i].length - 1; ++j) {
            if (max_len[j] === undefined) {
                max_len[j] = 0;
            }
            max_len[j] = Math.max(max_len[j], matrix[i][j].length);
        }
    }

    var text = "";
    for (i = 0; i < matrix.length; ++i) {
        for (j = 0; j < matrix[i].length - 1; ++j) {
            text += matrix[i][j];
            for (k = matrix[i][j].length; k < max_len[j]; ++k) {
                text += " ";
            }
            text += " ";
        }
        text += matrix[i][matrix[i].length - 1];
        text += "\n";
    }
    return text;
}
