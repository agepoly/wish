function parse(text) {
    "use strict";
    var errors = [];

    var ch = text.length === 0 ? null : text[0];
    var k = 0;
    var l = 0;
    var c = 0;

    var section = null;
    var slots = [];
    var participants = [];

    function eat() {
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

    function eatSection() {
        var cc = c;
        eat();
        var word = "";
        while (is_alpha(ch) || is_digit(ch)) {
            word += ch;
            eat();
        }
        if (ch !== "]") {
            errors.push({
                from: CodeMirror.Pos(l, cc),
                to: CodeMirror.Pos(l, c),
                message: "section must end with ]"
            });
            return;
        }
        eat();
        if (section === null && word !== "slots") {
            errors.push({
                from: CodeMirror.Pos(l, cc),
                to: CodeMirror.Pos(l, c),
                message: "first section must be slots"
            });
        }
        if (section === "slots" && word !== "participants") {
            errors.push({
                from: CodeMirror.Pos(l, cc),
                to: CodeMirror.Pos(l, c),
                message: "second section must be participants"
            });
        }
        section = word;
    }

    function eat_row() {
        var i;
        var cc;
        var string;

        if (section === null) {
            errors.push({
                from: CodeMirror.Pos(l, c),
                to: CodeMirror.Pos(l, c + 1),
                message: "must begin with [slots]"
            });
            skip_line();
            return;
        }

        if (ch !== "\"") {
            errors.push({
                from: CodeMirror.Pos(l, c),
                to: CodeMirror.Pos(l, c + 1),
                message: "string expected"
            });
            skip_line();
            return;
        }

        string = eat_string();

        if (!is_space(ch)) {
            errors.push({
                from: CodeMirror.Pos(l, c),
                to: CodeMirror.Pos(l, c + 1),
                message: "expected space after string"
            });
            skip_line();
            return;
        }
        while (is_space(ch)) {
            eat();
        }

        if (section === "slots") {
            var vmin = eat_number();
            if (!is_space(ch)) {
                errors.push({
                    from: CodeMirror.Pos(l, c),
                    to: CodeMirror.Pos(l, c + 1),
                    message: "expected space"
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
                slot: string,
                vmin: vmin,
                vmax: vmax
            });

            // TODO check vmin <= vmax

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
                    to: CodeMirror.Pos(l, c),
                    message: "not the right amount of values"
                });
            }

            // TODO check sum_vmin <= participants <= sum_vmax

            var tmp = row.slice();
            tmp.sort();
            for (i = 0; i < tmp.length; ++i) {
                if (tmp[i] > i) {
                    errors.push({
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
        errors.push({
            from: CodeMirror.Pos(l, c),
            to: CodeMirror.Pos(l, c + 1),
            message: "expected"
        });
        skip_line();
        return;
    }

    function is_space(ch) {
        return ch === " " || ch === "\t";
    }

    function is_digit(ch) {
        return ch !== null && (ch >= "0" && ch <= "9");
    }

    function is_alpha(ch) {
        return ch !== null && ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z'));
    }

    function eat_string() {
        var cc = c;
        eat();
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
            from: CodeMirror.Pos(l, cc),
            to: CodeMirror.Pos(l, c),
            message: "invalid string"
        });
        return "";
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

    function skip_line() {
        while (ch !== "\n" && ch !== null) {
            eat();
        }
        if (ch === "\n") {
            eat();
        }
    }

    while (ch !== null) {
        eat_line();
    }

    var ok = true;
    for (var i = 0; i < errors.length; ++i) {
        if (errors[i].severity !== "warning") {
            ok = false;
        }
    }

    return {
        slots: slots,
        participants: participants,
        errors: errors,
        ok: ok
    };
}
