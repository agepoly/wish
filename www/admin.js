var x = null;

function main() {
    "use strict";
    var i, j;
    document.getElementById("save").onclick = save;
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
    inputCode.on("change", function() {
        // execute timer and compute results
    });

    var outputCode = CodeMirror.fromTextArea(document.getElementById('output'), {
        lineNumbers: true,
        mode: "csv",
        readOnly: true
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

function save() {

}






var request = new XMLHttpRequest();
request.open('POST', window.location.origin + '/get_data', true);

request.onload = function() {
    if (this.status >= 200 && this.status < 400) {
        // Success!
        x = JSON.parse(this.response);
        if (document.readyState != 'loading') {
            main();
        } else {
            document.addEventListener('DOMContentLoaded', main);
        }
    } else {
        swal("Oops...", "Something went wrong!", "error");
    }
};

request.onerror = function() {
    swal("Oops...", "There was a connection error of some sort!", "error");
};

var payload = JSON.stringify({
    key: window.location.hash.substring(1),
});

request.send(payload);
