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
        }, function (dismiss) {
        });
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
                    if (state.string || state.section) {
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
                    } else {
                        return "atom";
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
                if ('0123456789.'.indexOf(ch) !== -1) {
                    return "number";
                }
                return "error";
            }
        };
    });

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

    INPUT_CODE.on("change", function() {});

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
    var i, j, k;

    var vmin = 0,
        vmax = 0;
    for (i = 0; i < content.slots.length; ++i) {
        vmin += content.slots[i].vmin;
        vmax += content.slots[i].vmax;
    }

    var permutation = [];
    for (i = 0; i < content.participants.length; ++i) {
        permutation.push(i);
    }
    shuffle(permutation);

    var x = Math.pow(content.slots.length, 2);
    for (i = 0; i < content.participants.length; ++i) {
        for (j = 0; j < content.participants[i].wish.length; ++j) {
            x = Math.max(x, Math.pow(content.participants[i].wish[j], 2));
        }
    }

    var cost = [];
    for (i = 0; i < content.participants.length; ++i) {
        var row = [];
        for (j = 0; j < content.slots.length; ++j) {
            var c = Math.pow(content.participants[i].wish[j], 2);
            for (k = 0; k < content.slots[j].vmin; ++k) {
                row.push(c);
            }
            for (k = content.slots[j].vmin; k < content.slots[j].vmax; ++k) {
                row.push(x + c);
            }
        }
        cost[permutation[i]] = row;
    }

    var start_time = new Date().getTime();
    var h = new Hungarian(cost);
    var solution = h.execute();
    var dt = new Date().getTime() - start_time;

    console.log(dt + " ms");

    for (i = 0; i < solution.length; ++i) {
        for (j = 0; j < content.slots.length; ++j) {
            if (solution[i] >= content.slots[j].vmax) {
                solution[i] -= content.slots[j].vmax;
            } else {
                solution[i] = j;
                break;
            }
        }
    }
    var result = [];
    for (i = 0; i < solution.length; ++i) {
        result[i] = solution[permutation[i]];
    }

    RESULT = [];
    for (i = 0; i < result.length; ++i) {
        RESULT[i] = {
            mail: content.participants[i].mail,
            slot: content.slots[result[i]].name
        };
    }

    var score = 0;
    for (i = 0; i < result.length; ++i) {
        score += Math.pow(content.participants[i].wish[result[i]], 2);
    }
    var text = "[statistics]\n";
    text += '"total score" ' + String(score) + '\n\n';

    var text_stats = [];
    text_stats.push(['# slot', '#participants', '#1st choice', '#2nd choice', '#3rd choice', '#4th choice', '...']);
    var s;
    var srow;
    for (i = 0; i < content.slots.length; ++i) {
        var slot_choices = [];
        var counter = 0;
        for (j = 0; j < result.length; ++j) {
            if (result[j] === i) {
                s = content.participants[j].wish[i];
                if (slot_choices[s] === undefined) {
                    slot_choices[s] = 0;
                }
                slot_choices[s]++;
                counter++;
            }
        }
        for (j = 0; j < slot_choices.length; ++j) {
            if (slot_choices[j] === undefined) {
                slot_choices[j] = 0;
            }
        }
        srow = [
            '"' + content.slots[i].name + '"',
            String(counter)
        ];
        for (j = 0; j < slot_choices.length; ++j) {
            srow.push(String(slot_choices[j]));
        }
        text_stats.push(srow);
    }
    var choices = [];
    for (i = 0; i < result.length; ++i) {
        s = content.participants[i].wish[result[i]];
        if (choices[s] === undefined) {
            choices[s] = 0;
        }
        choices[s]++;
    }
    text_stats[0].length = Math.min(text_stats[0].length, 2 + choices.length);
    var last_row = ['"total"', String(content.participants.length)];
    for (j = 0; j < choices.length; ++j) {
        if (choices[j] === undefined) {
            last_row.push("0");
        } else {
            last_row.push(String(choices[j]));
        }
    }
    text_stats.push(last_row);
    text += format_columns(text_stats) + "\n";

    text += "[results]\n";

    var text_result = [];
    for (i = 0; i < content.participants.length; ++i) {
        text_result[i] = [
            "\"" + content.participants[i].mail + "\"",
            "\"" + content.slots[result[i]].name + "\"",
            "# wish " + content.participants[i].wish[result[i]]
        ];
    }
    text += format_columns(text_result);
    OUTPUT_CODE.setValue(text);
}

function into_code(content) {
    "use strict";
    var i, j;

    var code = "[slots]\n";
    var slots = [];
    for (i = 0; i < content.slots.length; ++i) {
        slots[i] = ['"' + content.slots[i].name + '"', String(content.slots[i].vmin), String(content.slots[i].vmax)];
    }
    code += format_columns(slots);

    code += "\n[participants]\n";
    var participants = [];
    for (i = 0; i < content.participants.length; ++i) {
        participants[i] = ['"' + content.participants[i].mail + '"'];
        for (j = 0; j < content.participants[i].wish.length; ++j) {
            participants[i].push(String(content.participants[i].wish[j]));
        }
        switch (content.participants[i].status) {
            case -1:
                participants[i].push("# mail error");
                break;
            case 0:
                participants[i].push("# mail not sent");
                break;
            case 1:
                participants[i].push("# mail sent but no activity from participant");
                break;
            case 2:
                participants[i].push("# status : participant visited wish page");
                break;
            case 3:
                participants[i].push("# status : participant modified his/her wish");
                break;
            default:
                participants[i].push("# [status error]");
        }
    }
    code += format_columns(participants);

    return code;
}

function shuffle(a) {
    "use strict";

    var j, x, i;
    for (i = a.length; i; i--) {
        j = Math.floor(Math.random() * i);
        x = a[i - 1];
        a[i - 1] = a[j];
        a[j] = x;
    }
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
        if (matrix[i].length > 0) {
            for (j = 0; j < matrix[i].length - 1; ++j) {
                text += matrix[i][j];
                for (k = matrix[i][j].length; k < max_len[j]; ++k) {
                    text += " ";
                }
                text += " ";
            }
            text += matrix[i][matrix[i].length - 1];
        }
        text += "\n";
    }
    return text;
}
