var INPUT_CODE, OUTPUT_CODE;

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

    var default_content = {
        slots: [{ name: "slot 1", vmin: 0, vmax: 5 }, { name: "slot 2", vmin: 0, vmax: 5 }],
        participants: [{ mail: "Alice", wish: [0, 1] }, { mail: "Bob", wish: [1, 0] }]
    };
    var content;
    if (localStorage.content) {
        content = JSON.parse(localStorage.content);
    } else {
        content = default_content;
    }

    INPUT_CODE.setValue(into_code(content));
    assign(content);

    document.getElementById("save").onclick = function() {
        var out = parse(INPUT_CODE.getValue());

        if (out.errors.length > 0) {
            INPUT_CODE.focus();
            INPUT_CODE.setCursor(out.errors[0].from);
            swal({
                title: "Error",
                text: "The content contains some errors. Please fix them before saving.",
                type: "error"
            });
        } else {
            localStorage.content = JSON.stringify(out);
            swal({
                title: "Saved",
                text: "The content has been saved locally. You can quit the page safely.",
                type: "success"
            });
        }
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
}

function assign(content) {
    "use strict";
    var perm = permutation(content.participants.length);
    var cost = cost_matrix(content, perm);
    var result = assign_hugarian(cost, content.slots, perm);
    var text = result_into_text(content, result);
    OUTPUT_CODE.setValue(text);
}
