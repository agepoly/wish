function check_validity() {
	var err_color = '#FF9000';

	$("input").removeAttr('style');
	$("#mails").removeAttr('style');
	$("input[name='deadline']").removeAttr('style');

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

	if ($("#mails").length) {
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
		if (mails.length < total_vmin) {
			$(".vmin").css({'border-color' : err_color});
			$("#mails").css({'border-color' : err_color});
		}

		mails.sort();
		for (var i = 1; i < mails.length; ++i) {
			if (mails[i-1] == mails[i]) {
				$("#mails").css({'border-color' : err_color});
			}
		}
	}

	if ($("input[name='deadline']").length && $("input[name='deadline']").datepicker("getDate") == null) {
		$("input[name='deadline']").css({'border-color' : err_color});
	}
	
	if ($("input[name='amail']").length && $("input[name='amail']").val() == "") {
		$("input[name='amail']").css({'border-color' : err_color});
	}
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

	var content = '<div class="row"><div class="six columns"><label>Slots</label></div>'
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
