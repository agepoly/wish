var socket = io();
var inputCode, outputCode;

socket.on("get data", function(content) {
    "use strict";
    if (document.readyState != 'loading') {
        initDOM();
        initContent(content);
    } else {
        document.addEventListener('DOMContentLoaded', function() {
            initDOM();
            initContent(content);
        });
    }
});

socket.on('feedback', function(content) {
    "use strict";
    swal(content.title, content.message, content.type);
    document.getElementById('save').value = "Save";
});

socket.emit("get data", window.location.hash.substring(1));

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
        return out.errors;
    });

    inputCode = CodeMirror.fromTextArea(document.getElementById('input'), {
        lineNumbers: true,
        mode: "csv",
        gutters: ["CodeMirror-lint-markers"],
        lint: true
    });

    outputCode = CodeMirror.fromTextArea(document.getElementById('output'), {
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
            socket.emit('set data', {
                key: window.location.hash.substring(1),
                slots: out.slots,
                participants: out.participants
            });
        }
    };
    document.getElementById("assign").onclick = function() {
        var i, j, k;
        var out = parse(inputCode.getValue());

        if (!out.ok) {
            inputCode.focus();
            inputCode.setCursor(out.errors[0].from);
        } else {
            var vmin = 0,
                vmax = 0;
            for (i = 0; i < out.slots.length; ++i) {
                vmin += out.slots[i].vmin;
                vmax += out.slots[i].vmax;
            }

            var permutation = [];
            for (i = 0; i < out.participants.length; ++i) {
                permutation.push(i);
            }
            shuffle(permutation);

            var x = Math.pow(out.slots.length, 2);
            for (i = 0; i < out.participants.length; ++i) {
                for (j = 0; j < out.participants[i].wish.length; ++j) {
                    x = Math.max(x, Math.pow(out.participants[i].wish[j], 2));
                }
            }

            var cost = [];
            for (i = 0; i < out.participants.length; ++i) {
                var row = [];
                for (j = 0; j < out.slots.length; ++j) {
                    var c = Math.pow(out.participants[i].wish[j], 2);
                    for (k = 0; k < out.slots[j].vmin; ++k) {
                        row.push(c);
                    }
                    for (k = out.slots[j].vmin; k < out.slots[j].vmax; ++k) {
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
                for (j = 0; j < out.slots.length; ++j) {
                    if (solution[i] >= out.slots[j].vmax) {
                        solution[i] -= out.slots[j].vmax;
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

            var score = 0;
            for (i = 0; i < result.length; ++i) {
                score += Math.pow(out.participants[i].wish[result[i]], 2);
            }
            var text = "# total score : " + score + "\n#\n";

            var text_stats = [];
            var s;
            for (i = 0; i < out.slots.length; ++i) {
                var slot_choices = [];
                var counter = 0;
                for (j = 0; j < result.length; ++j) {
                    if (result[j] === i) {
                        s = out.participants[j].wish[i];
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
                text_stats[i] = [
                    "# \"" + out.slots[i].name + "\"",
                    String(counter)
                ];
                for (j = 0; j < slot_choices.length; ++j) {
                    text_stats[i].push(String(slot_choices[j]));
                }
            }
            var choices = [];
            for (i = 0; i < result.length; ++i) {
                s = out.participants[i].wish[result[i]];
                if (choices[s] === undefined) {
                    choices[s] = 0;
                }
                choices[s]++;
            }
            var last_row = ["# total", out.participants.length];
            for (j = 0; j < choices.length; ++j) {
                if (choices[j] === undefined) {
                    last_row.push("0");
                } else {
                    last_row.push(String(choices[j]));
                }
            }
            text_stats.push(last_row);
            text += format_columns(text_stats) + "\n";

            var text_result = [];
            for (i = 0; i < out.participants.length; ++i) {
                text_result[i] = [
                    "\"" + out.participants[i].mail + "\"",
                    "\"" + out.slots[result[i]].name + "\"",
                    "# wish " + out.participants[i].wish[result[i]]
                ];
            }
            text += format_columns(text_result);
            outputCode.setValue(text);
        }
    };
}

function initContent(content) {
    "use strict";
    var i, j;
    document.getElementById("name").innerHTML = "Event name: <strong>" + htmlEntities(content.name) + "</strong>";

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
                // mail not sent
                break;
            case 1:
                participants[i].push("# no activity");
                break;
            case 2:
                participants[i].push("# view");
                break;
            case 3:
                participants[i].push("# modified");
                break;
            default:
                participants[i].push("# [status error]");
        }
    }
    code += format_columns(participants);

    inputCode.setValue(code);
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
