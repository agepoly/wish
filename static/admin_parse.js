function parse(text) {
    "use strict";
    var errors = [];
    var warnings = [];

    var ch = text.length === 0 ? null : text[0];
    var k = 0; // absolute position
    var l = 0; // current line
    var c = 0; // relative to the current line

    var section = null;
    var slots = [];
    var participants = [];
    var sum_vmin = 0;
    var sum_vmax = 0;

    function is_space(ch) {
        return ch === " " || ch === "\t";
    }

    function is_digit(ch) {
        return ch !== null && (ch >= "0" && ch <= "9");
    }

    function is_alpha(ch) {
        return ch !== null && ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z'));
    }

    function eat(expected) {
        if ((typeof expected === "string" && ch !== expected) || (typeof expected === "object" && !expected.test(ch))) {
            errors.push({
                from: CodeMirror.Pos(l, c),
                to: CodeMirror.Pos(l, c + 1),
                message: "expected character [" + expected + "] got [" + ch + "]"
            });
        }
        if (ch === "\n") {
            l++;
            c = 0;
        } else {
            c++;
        }
        k++;
        if (k < text.length) {
            ch = text[k];
        } else {
            ch = null;
        }
    }

    function skip_line() {
        while (ch !== "\n" && ch !== null) {
            eat();
        }
        if (ch === "\n") {
            eat();
        }
    }

    function eatSection() {
        var begin = c;
        eat('[');
        var word = "";
        while (is_alpha(ch) || is_digit(ch) || ch === " ") {
            word += ch;
            eat();
        }
        eat("]");

        if ((section === null && word == "slots") || (section === "slots" && word == "participants")) {
            section = word;
        } else {
            errors.push({
                from: CodeMirror.Pos(l, begin),
                to: CodeMirror.Pos(l, c),
                message: "unexpected section"
            });
            section = null;
        }
    }

    function eat_string() {
        var begin = c;
        eat("\"");
        var word = "";
        while (true) {
            if (ch === "\"") {
                eat();
                return word;
            }
            if (ch === null || ch === "\n") {
                break;
            }
            word += ch;
            eat();
        }
        errors.push({
            from: CodeMirror.Pos(l, begin),
            to: CodeMirror.Pos(l, c),
            message: "invalid string"
        });
        return null;
    }

    function eat_number() {
        var entry = ch;
        eat();
        while (is_digit(ch)) {
            entry += ch;
            eat();
        }
        var num = Number(entry);
        if (isNaN(num) || num < 0 || entry[0] === "\n") {
            errors.push({
                from: CodeMirror.Pos(l, c - entry.length),
                to: CodeMirror.Pos(l, c),
                message: "'" + entry + "' is not a non-negative number"
            });
            return NaN;
        }
        return num;
    }

    function eat_row() {
        var i;

        if (section === null) {
            errors.push({
                from: CodeMirror.Pos(l, 0),
                to: CodeMirror.Pos(l, 1),
                severity: "warning",
                message: "line ignored"
            });
            skip_line();
            return;
        }

        var string = eat_string();
        if (string === null) {
            skip_line();
            return;
        }

        eat(/[ \t]/);
        while (is_space(ch)) {
            eat();
        }

        if (section === "slots") {
            var vmin = eat_number();
            if (!is_space(ch)) {
                errors.push({
                    from: CodeMirror.Pos(l, 0),
                    to: CodeMirror.Pos(l, c + 1),
                    message: "maximum bound expected"
                });
                skip_line();
                return;
            }
            while (is_space(ch)) {
                eat();
            }
            var vmax = eat_number();
            while (is_space(ch)) {
                eat();
            }
            slots.push({
                name: string,
                vmin: vmin,
                vmax: vmax
            });
            sum_vmin += vmin;
            sum_vmax += vmax;

            if (vmax < vmin) {
                errors.push({
                    from: CodeMirror.Pos(l, 0),
                    to: CodeMirror.Pos(l, c + 1),
                    message: "maximum bound must be greater or equal to minimum bound"
                });
            }

        } else if (section === "participants") {
            var row = [];
            while (true) {
                var x = eat_number();
                row.push(x);
                while (is_space(ch)) {
                    eat();
                }
                if (!is_digit(ch)) {
                    break;
                }
            }

            participants.push({
                mail: string,
                wish: row
            });

            if (row.length !== slots.length) {
                errors.push({
                    from: CodeMirror.Pos(l, 0),
                    to: CodeMirror.Pos(l, c + 1),
                    message: "You have " + slots.length + " slots, therefore you need " + slots.length + " values"
                });
            }

            if (participants.length > sum_vmax) {
                errors.push({
                    from: CodeMirror.Pos(l, 0),
                    to: CodeMirror.Pos(l, c),
                    message: "Too much participants for the maximal bounds"
                });
            }

            var tmp = row.slice();
            tmp.sort();
            for (i = 0; i < tmp.length; ++i) {
                if (tmp[i] > i) {
                    warnings.push({
                        from: CodeMirror.Pos(l, 0),
                        to: CodeMirror.Pos(l, c),
                        severity: "warning",
                        message: "This wish is not fair"
                    });
                    break;
                }
            }
        }

        if (ch === "#") {
            skip_line();
            return;
        }
        if (ch === "\n") {
            eat();
            return;
        }
        if (ch === null) {
            return;
        }
        errors.push({
            from: CodeMirror.Pos(l, c),
            to: CodeMirror.Pos(l, c + 1),
            message: "something expected"
        });
        skip_line();
        return;
    }

    function eat_line() {
        while (is_space(ch)) {
            eat();
        }
        if (ch === "\n") {
            eat();
            return;
        }
        if (ch === "#") {
            skip_line();
            return;
        }
        if (ch === "[") {
            eatSection();
            skip_line();
            return;
        }
        if (ch !== null) {
            eat_row();
        }
    }

    while (ch !== null) {
        eat_line();
    }

    if (participants.length < sum_vmin) {
        errors.push({
            from: CodeMirror.Pos(l, 0),
            to: CodeMirror.Pos(l, c + 1),
            message: "Not enough participants for the minimal bounds"
        });
    }

    return {
        slots: slots,
        participants: participants,
        errors: errors,
        warnings: warnings
    };
}
