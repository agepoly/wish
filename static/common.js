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

function permutation(n) {
    "use strict";
    var i;
    var p = [];
    for (i = 0; i < n; ++i) {
        p.push(i);
    }
    shuffle(p);
    return p;
}

function cost_matrix(content, perm) {
    "use strict";
    var i, j, k;
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
        cost[perm[i]] = row;
    }
    return cost;
}

function assign_hugarian(cost, slots, perm) {
    "use strict";
    var i, j;
    var start_time = new Date().getTime();
    var h = new Hungarian(cost);
    var solution = h.execute();
    var dt = new Date().getTime() - start_time;

    console.log(dt + " ms");

    for (i = 0; i < solution.length; ++i) {
        for (j = 0; j < slots.length; ++j) {
            if (solution[i] >= slots[j].vmax) {
                solution[i] -= slots[j].vmax;
            } else {
                solution[i] = j;
                break;
            }
        }
    }
    var result = [];
    for (i = 0; i < solution.length; ++i) {
        result[i] = solution[perm[i]];
    }
    return result;
}

function result_into_text(content, result) {
    "use strict";
    var i, j;
    var score = 0;
    for (i = 0; i < result.length; ++i) {
        score += Math.pow(content.participants[i].wish[result[i]], 2);
    }
    var text = "[statistics]\n";
    text += '"total score" ' + String(score) + '\n\n';

    var text_stats = [];
    text_stats.push(['% slot name', '# of participants', '# in wish 0', '# in wish 1', '# in wish 2', '# in wish 3', '...']);
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
            "% wish=" + content.participants[i].wish[result[i]]
        ];
    }
    text += format_columns(text_result);
    return text;
}

function into_code(content) {
    "use strict";
    var i, j;

    var code = "[slots]\n";
    var slots = [];
    slots.push(["% slot name", "min", "max"]);
    for (i = 0; i < content.slots.length; ++i) {
        slots.push(['"' + content.slots[i].name + '"', 
                    String(content.slots[i].vmin), 
                    String(content.slots[i].vmax),
                    "% slot #" + String(i + 1)]);
    }
    code += format_columns(slots);

    code += "\n[participants]\n";
    var participants = [];
    var row = ["% slots:"];
    for (i = 0; i < content.slots.length; ++i) {
        row.push("#" + String(i + 1));
    }
    participants.push(row);
    for (i = 0; i < content.participants.length; ++i) {
        row = ['"' + content.participants[i].mail + '"'];
        for (j = 0; j < content.participants[i].wish.length; ++j) {
            row.push(String(content.participants[i].wish[j]));
        }
        if (content.participants[i].status) {
            switch (content.participants[i].status) {
                case -1:
                    row.push("% mail error");
                    break;
                case 0:
                    row.push("% mail not sent");
                    break;
                case 1:
                    row.push("% mail sent but no activity from participant");
                    break;
                case 2:
                    row.push("% status : participant visited wish page");
                    break;
                case 3:
                    row.push("% status : participant modified his/her wish");
                    break;
                default:
                    row.push("% [status error]");
            }
        }
        participants.push(row);
    }
    code += format_columns(participants);

    return code;
}

function csv_mode_for_code_mirror() {
    "use strict";
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
            if (ch === "#" || ch === "%") {
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
}
