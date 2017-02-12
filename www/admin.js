var x = null;

function main() {
    document.getElementById("save").onclick = save;

    CodeMirror.defineMode("csv", function() {
        return {
            startState: function() {
                return {
                    commentLine: false
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
                if (ch === "#") {
                    state.commentLine = true;
                    return "comment";
                }
                if (ch === "," || ch === ";") {
                    return "keyword";
                }
                return "atom";
            }
        };
    });

    CodeMirror.registerHelper("lint", "csv", function(text) {
        return [];
    });

    inputCode = CodeMirror.fromTextArea(document.getElementById('input'), {
        lineNumbers: true,
        mode: "csv",
        gutters: ["CodeMirror-lint-markers"],
        lint: true
    });
    inputCode.on("change", function() {
        // execute timer and compute results
    });

    outputCode = CodeMirror.fromTextArea(document.getElementById('output'), {
        lineNumbers: true,
        mode: "csv",
        readOnly: true
    });

    inputCode.setValue(String(x.wishes));
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
