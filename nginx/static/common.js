var API_PORT = 3000;

function check_validity() {
    var err_color = '#FF4000';
    var valid = true;

    $("input").removeAttr('style');
    $("#mails").removeAttr('style');
    $("input[name='deadline']").removeAttr('style');
    $("#mails_error").empty();
    $("#slots_error").empty();

    if ($("input[name='name']").val() === "") {
        $("input[name='name']").css({
            'border-color': err_color
        });
        valid = false;
    }

    var total_vmin = 0;
    var total_vmax = 0;

    for (var i = 0; $("input[name='slot" + i + "']").length; ++i) {
        if ($("input[name='slot" + i + "']").val() === "") {
            $("input[name='slot" + i + "']").css({
                'border-color': err_color
            });
            valid = false;
            $("#slots_error").text('A slot name is empty.');
        }
        var vmin = Number($("input[name='vmin" + i + "']").val());
        var vmax = Number($("input[name='vmax" + i + "']").val());
        if (vmin < 0) {
            $("input[name='vmin" + i + "']").css({
                'border-color': err_color
            });
            $("#slots_error").text('Minimum bounds must be a non-negative number.');
            valid = false;
        }
        if (vmax <= 0) {
            $("input[name='vmax" + i + "']").css({
                'border-color': err_color
            });
            $("#slots_error").text('Maximum bounds must be as positive number.');
            valid = false;
        }
        if (vmin > vmax) {
            $("input[name='vmin" + i + "']").css({
                'border-color': err_color
            });
            $("input[name='vmax" + i + "']").css({
                'border-color': err_color
            });
            $("#slots_error").text('Maximum bound must be larger or equal to minimum bound.');
            valid = false;
        }
        total_vmin += vmin;
        total_vmax += vmax;
    }

    if ($("#mails").length) {
        if ($("#mails").val() === "") {
            $("#mails").css({
                'border-color': err_color
            });
            valid = false;
        }

        var mails = $("#mails").val().split(/[\s,]+/);

        for (i = 0; i < mails.length; ++i) {
            if (mails[i] === "") {
                $("#mails").css({
                    'border-color': err_color
                });
                valid = false;
            }
        }

        if (mails.length > total_vmax) {
            $(".vmax").css({
                'border-color': err_color
            });
            $("#mails").css({
                'border-color': err_color
            });
            $("#slots_error").text('Too many participants for the maximum bounds.');
            $("#mails_error").text('Too many participants for the maximum bounds.');
            valid = false;
        }
        if (mails.length < total_vmin) {
            $(".vmin").css({
                'border-color': err_color
            });
            $("#mails").css({
                'border-color': err_color
            });
            $("#slots_error").text('Not enough participants for the minimum bounds.');
            $("#mails_error").text('Not enough participants for the minimum bounds.');
            valid = false;
        }

        mails.sort();
        for (i = 1; i < mails.length; ++i) {
            if (mails[i - 1] == mails[i]) {
                $("#mails").css({
                    'border-color': err_color
                });
                $("#mails_error").text('A mail address appear more than once');
                valid = false;
            }
        }
    }
    if (typeof x !== 'undefined' && typeof x.mails !== 'undefined') {
        if (x.mails.length > total_vmax) {
            $(".vmax").css({
                'border-color': err_color
            });
            $("#slots_error").text('Too many participants for the maximum bounds.');
            $("#mails_error").text('Too many participants for the maximum bounds.');
            valid = false;
        }
        if (x.mails.length < total_vmin) {
            $(".vmin").css({
                'border-color': err_color
            });
            $("#slots_error").text('Not enough participants for the minimum bounds.');
            $("#mails_error").text('Not enough participants for the minimum bounds.');
            valid = false;
        }
    }

    if ($("input[name='deadline']").length && $("input[name='deadline']").datepicker("getDate") === null) {
        $("input[name='deadline']").css({
            'border-color': err_color
        });
        valid = false;
    }

    if ($("input[name='amail']").length && $("input[name='amail']").val() === "") {
        $("input[name='amail']").css({
            'border-color': err_color
        });
        valid = false;
    }

    return valid;
}



var oldvalues = {
    slot: [],
    vmin: [],
    vmax: []
};

function create_slots() {
    var n = $("input[name='nslots']").val();
    if (n > Number($("input[name='nslots']").prop('max'))) {
        return;
    }
    var old = get_slot_val();
    for (var i = 0; i < old.slot.length; ++i) {
        oldvalues.slot[i] = old.slot[i];
        oldvalues.vmin[i] = old.vmin[i];
        oldvalues.vmax[i] = old.vmax[i];
    }

    var content = '<div class="row"><div class="six columns"><label title="Introduce the names of the activities, the time slots for the oral exam, the names of the various tasks to perform...">Slots</label></div>';
    content += '<div class="three columns"><label title="The algorithm will ensure that at least this many people are in this slot.">Min people</label></div>';
    content += '<div class="three columns"><label title="The algorithm will ensure that no more than this many people are in this slot.">Max people</label></div></div>';
    for (i = 0; i < n; ++i) {
        var values = {
            name: "",
            vmin: "0",
            vmax: "10"
        };
        if (i < oldvalues.slot.length) {
            values.name = oldvalues.slot[i];
            values.vmin = oldvalues.vmin[i];
            values.vmax = oldvalues.vmax[i];
        }
        content += '<div class="row"><div class="six columns"><input type="text" placeholder="Tuesday morning" class="slot u-full-width" name="slot' + i + '" value="' + values.name + '" title="Introduce the names of the activities, the time slots for the oral exam, the names of the various tasks to perform..."></div>';
        content += '<div class="three columns"><input type="number" class="vmin u-full-width" name="vmin' + i + '" min="0" max="100" step="1" value="' + values.vmin + '" title="The algorithm will ensure that at least this many people are in this slot."></div>';
        content += '<div class="three columns"><input type="number" class="vmax u-full-width" name="vmax' + i + '" min="0" max="100" step="1" value="' + values.vmax + '" title="The algorithm will ensure that no more than this many people are in this slot."></div></div>';
    }
    $("#slots").html(content);
    //$("input").bind('input propertychange', check_validity);
}


function get_slot_val() {
    var slot = [];
    var vmin = [];
    var vmax = [];
    for (var i = 0; $("input[name='slot" + i + "']").length; ++i) {
        slot[i] = $("input[name='slot" + i + "']").val();
        vmin[i] = Number($("input[name='vmin" + i + "']").val());
        vmax[i] = Number($("input[name='vmax" + i + "']").val());
    }

    return {
        slot: slot,
        vmin: vmin,
        vmax: vmax
    };
}
