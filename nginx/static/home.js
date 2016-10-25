
$(document).ready(function() {
	$("input[name='nslots']").bind('input propertychange', create_slots);
	$("#send").click(send);
	$("input").bind('input propertychange', check_validity);
	$("textarea").bind('input propertychange', check_validity);
	$("input[name='deadline']").prop('min', new Date().toJSON().split('T')[0]);
	create_slots();
	check_validity();
});

function send() {
	var slots = get_slot_val();
	var deadline = new Date($("input[name='deadline']").val()).getTime() / 1000;
	if (isNaN(deadline)) {
		deadline = 0;
	}
	
	var message = $("#message").val()
		.replace(/\n/g, "\\n").replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\t/g, "\\t");

	var payload = '{'
		+'"name"     : "'+$("input[name='name']").val()+'", '
		+'"deadline" : '+deadline+', '
		+'"amail"    : "'+$("input[name='amail']").val()+'", '
		+'"mails"    : ["'+$("#mails").val().split(/[\s,]+/).join('","')+'"], '
		+'"slots"    : ["'+slots.slot.join('","')+'"], '
		+'"vmin"     : ['+ slots.vmin.join(',')  +'], '
		+'"vmax"     : ['+ slots.vmax.join(',')  +'], '
		+'"url"      : "'+ window.location.hostname + ':' + window.location.port + '", '
		+'"message"  : "'+message+'"'
		+'}';

	console.log(payload);
	
	$('#send').prop('disabled', true);
	$('#send').text('Request sent...');
	$("#status").hide();

	$.ajax({
		type: "POST",
		url: "http://"+window.location.hostname+":3000/create",
		data: payload,
		success: function(data) {
			console.log("creation success");
			swal("Creation success!", "A mail has been sent to "+$("input[name='amail']").val()+" to validate the activity.", "success");
			$('#send').prop('disabled', false);
			$('#send').text('Re create');
		},
		error: function(data) {
			console.log(data);
			$("#status").show();
			$("#status").text('Creation failed : ' + data.responseText);
			$('#send').prop('disabled', false);
			$('#send').text('Re create');
		},
	});
}

var oldvalues = { slot : [], vmin : [], vmax : [] };

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

	var content = '<div class="row"><div class="six columns"><label>Time slots</label></div>'
	content += '<div class="three columns"><label>Min people</label></div>'
	content += '<div class="three columns"><label>Max people</label></div></div>'
	for (var i = 0; i < n; ++i) {
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
		content += '<div class="row"><div class="six columns"><input type="text" placeholder="Tuesday morning" class="slot u-full-width" name="slot'+i+'" value="'+values.name+'"></div>'
			+ '<div class="three columns"><input type="number" class="vmin u-full-width" name="vmin'+i+'" min="0" max="100" step="1" value="'+values.vmin+'"></div>'
			+ '<div class="three columns"><input type="number" class="vmax u-full-width" name="vmax'+i+'" min="0" max="100" step="1" value="'+values.vmax+'"></div></div>'
	}
	$("#slots").html(content);
	$("input").bind('input propertychange', check_validity);
}


function get_slot_val() {
	var slot = [];
	var vmin = [];
	var vmax = [];
	for (var i = 0; $("input[name='slot"+i+"']").length; ++i) {
		slot[i] = $("input[name='slot"+i+"']").val();
		vmin[i] = $("input[name='vmin"+i+"']").val();
		vmax[i] = $("input[name='vmax"+i+"']").val();
	}

	return { slot: slot, vmin: vmin, vmax: vmax };
}


function check_validity() {
	var err_color = '#FF9000';

	$("input").removeAttr('style');
	$("#mails").removeAttr('style');

	if ($("input[name='name']").val() == "") {
		$("input[name='name']").css({'border-color' : err_color});
	}

	var total_vmin = 0;
	var total_vmax = 0;

	for (var i = 0; $("input[name='slot"+i+"']").length; ++i) {
		if ($("input[name='slot"+i+"']").val() == "") {
			$("input[name='slot"+i+"']").css({'border-color' : err_color});
		}
		var vmin = Number($("input[name='vmin"+i+"']").val());
		var vmax = Number($("input[name='vmax"+i+"']").val());
		if (vmin < 0) {
			$("input[name='vmin"+i+"']").css({'border-color' : err_color});
		}
		if (vmax <= 0) {
			$("input[name='vmax"+i+"']").css({'border-color' : err_color});
		}
		if (vmin > vmax) {
			$("input[name='vmin"+i+"']").css({'border-color' : err_color});
			$("input[name='vmax"+i+"']").css({'border-color' : err_color});
		}
		total_vmin += vmin;
		total_vmax += vmax;
	}

	if ($("#mails").val() == "") {
		$("#mails").css({'border-color' : err_color});
	}

	var mails = $("#mails").val().split(/[\s,]+/);

	for (var i = 0; i < mails.length; ++i) {
		if (mails[i] == "") {
			$("#mails").css({'border-color' : err_color});
		}
	}

	if (mails.length > total_vmax) {
		$(".vmax").css({'border-color' : err_color});
		$("#mails").css({'border-color' : err_color});
	}
	if (mails.length > total_vmin) {
		$(".vmin").css({'border-color' : err_color});
		$("#mails").css({'border-color' : err_color});
	}

	mails.sort();
	for (var i = 1; i < mails.length; ++i) {
		if (mails[i-1] == mails[i]) {
			$("#mails").css({'border-color' : err_color});
		}
	}

	if ($("input[name='deadline']").val() == "") {
		$("input[name='deadline']").css({'border-color' : err_color});
	}
	
	if ($("input[name='amail']").val() == "") {
		$("input[name='amail']").css({'border-color' : err_color});
	}
}
