//var key = window.location.pathname.split("/")[2];
var key = window.location.hash.substring(1);
var x = null;
var deadline = null;
var now = new Date();

$(document).ready(function() {
	console.log("hello world");

	$.post("http://localhost:3000/get_data", '{ "key" : "'+key+'" }', function(data,status) {
		if (status == "success") {
			console.log("hi");
			x = eval('(' + data + ')');
			$("#name").html('<b>Activity name: </b>'+x.name);
			$("#mail").html('<b>Your email: </b>'+x.mail);

			deadline = new Date(x.deadline * 1000);
			// x.deadline [seconds]
			// deadline [milliseconds]

			if (deadline > now) {
				var hours = Math.floor((deadline-now)/1000/3600);
				var days = Math.floor(hours / 24);
				hours = hours % 24;
				$("#deadline").html('<b>Deadline: </b>'+deadline.toJSON().split('T')[0]+' (in '+days+' days and '+hours+' hours)');
			} else {
				var days = Math.floor((now-deadline)/1000/3600/24);
				$("#deadline").html('<b>Deadline: </b>'+deadline.toJSON().split('T')[0]+' ('+days+' days ago)');
			}

			if (x.results.length > 0) {
				var content = '<table style="width:100%"><tr><th>Slot Name</th><th>Mail</th></tr>';
				var n = x.slots.length;
				for (i=0; i< n; ++i) {
					var list = [];
					for (j=0; j < x.mails.length; ++j) {
						if (x.results[j] == i) {
							list.push(x.mails[j]);
						}
					}
					content += '<tr><th>'+x.slots[i]+'</th><th>'+list.join(", ")+'</th></tr>';
				}
				content += '</table>';
				$("#content").html(content);
			} else {
				var content = '<table style="width:100%"><tr><th>Slot Name</th><th>Wish</th></tr>';
				var n = x.slots.length;
				for (i=0; i< n; ++i) {
					content += '<tr><th>'+x.slots[i]+'</th><th><input type="number" name="wish'+i+'" min="1" max="'+n+'" step="1" value="'+(n-x.wish[i])+'"></th></tr>';
				}
				content += '</table>';
				$("#content").html(content);
				$("input").bind('input propertychange', upload_wish);
				$("input").bind('input propertychange', color_wish);
				color_wish();
			}
		} else {
			console.log("hello");
		}
	});
});

function upload_wish() {
	var wish = [];
	var n = x.slots.length;
	for (var i = 0; i < n; ++i) {
		wish.push(n - Number($("input[name='wish"+i+"']").val()));
	}

	var data = '{ "key" : "'+key+'", "wish" : ['+wish.join(",")+'], "admin_key" : "" }';
	console.log(data);

	$.ajax({
		type: "POST",
		url: "http://localhost:3000/set_wish",
		data: data,
		success: function(data) {
			console.log(data);
			$("input").css({'border-color' : ''});
			$("#error").text('');
		},
		error: function(data) {
			console.log(data);
			$("input").css({'border-color' : '#FF0000'});
			$("#error").text('The values are not valid: each number must appear one time');
		},
	});
}

function color_wish() {
	var colormap = ['#40ff00', '#80ff00', '#bfff00', '#ffff00', '#ffbf00', '#ff8000', '#ff4000', '#ff0000'];
	var n = x.slots.length;
	for (var i = 0; i < n; ++i) {
		var v = n - Number($("input[name='wish"+i+"']").val());
		// v = 0 .. n-1
		v = v * (colormap.length - 1) / (n - 1);
		v = Math.round(v);
		$("input[name='wish"+i+"']").css({'background-color' : colormap[v]});
	}
}
