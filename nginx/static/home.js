
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

	var payload = '{'
		+'"name"     : "'+$("input[name='name']").val()+'", '
		+'"deadline" : '+deadline+', '
		+'"mails"    : ["'+$("#mails").val().split(/[\s,]+/).join('","')+'"], '
		+'"slots"    : ["'+slots.slot.join('","')+'"], '
		+'"vmin"     : ['+ slots.vmin.join(',')  +'], '
		+'"vmax"     : ['+ slots.vmax.join(',')  +']'
		+'}';

	console.log(payload);

	$.post("http://localhost:3000/create", payload, function(data,status) {
		if (status == "success") {
			var x = eval('(' + data + ')');
			var url = window.location.hostname + ":" + window.location.port + "/";
			var content = "";
			for (i=0; i < x.people.length; ++i) {
				content += x.people[i].mail+" "+url+"get#"+x.people[i].key+"\n";
			}
			$("#output").html(content);
			$("#admin_url").html(url+"admin#"+x.admin_key);
		}
	});
}

function create_slots() {
	var n = $("input[name='nslots']").val();
	var oldvalues = get_slot_val();

	var content = '<div class="row"><div class="six columns"><label>Time slots</label></div>'
	content += '<div class="three columns"><label>Min people</label></div>'
	content += '<div class="three columns"><label>Max people</label></div></div>'
	for (i=0; i < n; ++i) {
		var values = {
			name: "Slot "+(i+1),
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
		slot.push($("input[name='slot"+i+"']").val());
		vmin.push($("input[name='vmin"+i+"']").val());
		vmax.push($("input[name='vmax"+i+"']").val());
	}

	return { slot: slot, vmin: vmin, vmax: vmax };
}

function check_validity() {
	$("input").removeAttr('style');
	$("#mails").removeAttr('style');

	if ($("input[name='name']").val() == "") {
		$("input[name='name']").css({'border-color' : '#FF0000'});
	}

	var max_capacity = 0;

	for (var i = 0; $("input[name='slot"+i+"']").length; ++i) {
		if ($("input[name='slot"+i+"']").val() == "") {
			$("input[name='slot"+i+"']").css({'border-color' : '#FF0000'});
		}
		var vmin = Number($("input[name='vmin"+i+"']").val());
		var vmax = Number($("input[name='vmax"+i+"']").val());
		if (vmin > vmax) {
			$("input[name='vmin"+i+"']").css({'border-color' : '#FF0000'});
			$("input[name='vmax"+i+"']").css({'border-color' : '#FF0000'});
		}
		max_capacity += vmax;
	}

	if ($("#mails").val() == "") {
		$("#mails").css({'border-color' : '#FF0000'});
	}

	var mails = $("#mails").val().split(/[\s,]+/);

	for (var i = 0; i < mails.length; ++i) {
		if (mails[i] == "") {
			$("#mails").css({'border-color' : '#FF0000'});
		}
	}

	if (mails.length > max_capacity) {
		$(".vmax").css({'border-color' : '#FF0000'});
		$("#mails").css({'border-color' : '#FF0000'});
	}

	mails.sort();
	for (var i = 1; i < mails.length; ++i) {
		if (mails[i-1] == mails[i]) {
			$("#mails").css({'border-color' : '#FF0000'});
		}
	}


	if ($("input[name='deadline']").val() == "") {
		$("input[name='deadline']").css({'border-color' : '#FF0000'});
	}
}
