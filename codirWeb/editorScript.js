var socket = io();
var Range = ace.require('ace/range').Range;
var markers = [];

var deltas = [0];
var userDeltas = [0];
var deltaBuffer = [];
var historyPointer = 0;

socket.emit('new-page-update', getDirectory());

function getDirectory() {
	return $("meta[name='directory']").attr('content');
}

function subtractDeltas(base, negative) {

	for (i=0; i<base.length; i++) {
		console.log(JSON.stringify(base))
		console.log(JSON.stringify(negative))

		if (negative.lines.length == 0) break;
		if (negative.lines.length == 1 && negative.lines[0] == '') break;

		if (negative.action == 'insert') {
			if (negative.start.row < base[i].start.row) {
				console.log('i1')
				length = negative.lines.length - 1;
				base[i].start.row += length;
				base[i].end.row += length;
			} else if (negative.start.row == base[i].start.row && negative.start.column <= base[i].start.column && !base[i].undone) {
				console.log('i2')
				vertLength = negative.lines.length - 1;
				horiLength = negative.lines[vertLength].length;

				base[i].start.row += vertLength;
				base[i].end.row += vertLength;
				base[i].start.column = (negative.lines.length == 1)? base[i].start.column + horiLength : base[i].start.column + horiLength - negative.start.column;// - negative.start.column;
				if (base[i].start.row == base[i].end.row) base[i].end.column += horiLength;// - negative.start.column;
			} else if (base[i].action == 'insert' && base[i].undone == undefined && (negative.start.row < base[i].end.row || (negative.start.row == base[i].end.row && negative.start.column < base[i].end.column))) {
				console.log('i3')
				set = JSON.parse(JSON.stringify([base[i], base[i]]));

				vertLength = negative.lines.length - 1;
				horiLength = negative.lines[vertLength].length;
				rowCenter = 1 + negative.start.row - set[0].start.row;
				columnCenter = negative.start.column;

				set[0].end.row = negative.start.row;
				set[0].end.column = negative.start.column;
				set[0].lines.splice(rowCenter, set[0].lines.length - rowCenter);
				set[0].lines[set[0].lines.length - 1] = set[0].lines[set[0].lines.length - 1].substr(0, columnCenter);

				set[1].start.row = negative.end.row;
				set[1].end.row = negative.end.row + vertLength;
				set[1].start.column = negative.end.column;
				if (set[1].start.row == set[1].end.row) set[1].end.column += horiLength;
				set[1].lines.splice(0, rowCenter - 1);
				set[1].lines[0] = set[1].lines[0].substr(columnCenter);

				base.splice.apply(base, [i, 1].concat(set)); 
				i++;
			} else if (base[i].undone && base[i].start.row == negative.start.row && base[i].start.column == negative.start.column) {
				console.log('i4')
				var baseStr = '';
				var negativeStr = '';

				for (j in base[i].lines) baseStr += (j > 0)? '\n' + base[i].lines[j] : base[i].lines[j];
				for (j in negative.lines) negativeStr += (j > 0)? '\n' + negative.lines[j] : negative.lines[j];

				// positive values deal with location in negative string
				// negative values deal with location in base string

				var start;
				var end;

				var len = 0;

				if (base[i].start.row < negative.start.row || (base[i].start.row == negative.start.row && base[i].start.column < negative.start.column)) {
					for (var j = 1; j < baseStr.length; j++) {
						cap = Math.min(negativeStr.length, j)
						if (baseStr.substr(baseStr.length - j, cap) == negativeStr.substr(0,cap)) {
							len = cap;
							start = j - baseStr.length;
							end = (j >= negativeStr.length)? start - cap: cap; 
						}
					}
				} else if (base[i].start.row > negative.start.row || (base[i].start.row == negative.start.row && base[i].start.column > negative.start.column)) {
					for (var j = 0; j < negativeStr.length; j++) {
						cap = Math.min(baseStr.length, j);
						if (negativeStr.substr(negativeStr.length - j, cap) == baseStr.substr(0,cap)) {
							len = cap;
							start = negativeStr.length - j;
							end = (j >= baseStr.length)? start + cap : -cap;
						}
					}
				} else {
					for (var j = 1; j <= baseStr.length; j++) {
						cap = Math.min(negativeStr.length, j)
						if (baseStr.substr(baseStr.length - j, cap) == negativeStr.substr(0,cap)) {
							len = cap;
							start = j - baseStr.length;
							end = (j >= negativeStr.length)? start - cap: cap; 
						}
					}

					for (var j = 0; j <= negativeStr.length; j++) {
						cap = Math.min(baseStr.length, j);
						if (negativeStr.substr(negativeStr.length - j, cap) == baseStr.substr(0,cap) && cap > len) {
							len = cap;
							start = negativeStr.length - j;
							end = (j >= baseStr.length)? start + cap : -cap;
						}
					}
				}

				console.log('base\n' + baseStr);
				console.log('nega\n' + negativeStr);

				console.log('start: '+ start);
				console.log('end: '+ end);

				if (start == undefined) {
					continue;
				}

				if (start < 0) {
					startRow = (baseStr.substr(0, Math.abs(start)).match(/\n/g) || []).length;
					startColumn = Math.abs(start) - ((start == 0)? 0 : (baseStr.lastIndexOf('\n', Math.abs(start)-1) + 1))// + ((startRow == 0)? base[i].start.column : 0);		
				
					if (end < 0) {
						endRow = (baseStr.substr(0, Math.abs(end)).match(/\n/g) || []).length;
						endColumn = Math.abs(end) - (baseStr.lastIndexOf('\n', Math.abs(end)-1)+1) + ((0 == endRow)? startColumn : 0);
					} else {
						endRow = (baseStr.substr(0, baseStr.length - 1).match(/\n/g) || []).length;
						endColumn = len - (negativeStr.lastIndexOf('\n', len-1)+1) + ((startRow == endRow)? startColumn : 0);
					}
				} else {
					startRow = (negativeStr.substr(0, Math.abs(start)).match(/\n/g) || []).length;
					startColumn = Math.abs(start) - ((start == 0)? 0 : (negativeStr.lastIndexOf('\n', Math.abs(start)-1) + 1));// + ((startRow == 0)? negative.start.column : 0);		
				
					if (end > 0) {
						endRow = (negativeStr.substr(0, Math.abs(end)).match(/\n/g) || []).length;
						endColumn = Math.abs(end) - (negativeStr.lastIndexOf('\n', Math.abs(end)-1)+1) + ((0 == endRow)? startColumn : 0);
					} else {
						endRow = (negativeStr.substr(0, negativeStr.length - 1).match(/\n/g) || []).length;
						endColumn = len - (baseStr.lastIndexOf('\n', len-1)+1) + ((startRow == endRow)? startColumn : 0);
					}
				}

				console.log('startRow: '+startRow+' startColumn: '+startColumn);
				console.log('endRow: '+endRow+' endColumn: '+endColumn);

				if (start < 0 && end < 0) {
					console.log('i4.1');
					set = JSON.parse(JSON.stringify([base[i], base[i], base[i]]));
					
					set[0].end.row = startRow + base[i].start.row;
					set[0].end.column = startColumn + ((startRow == 0)? set[0].start.column : 0);
					set[0].lines.splice(startRow + 1);
					zerolength = set[0].lines.length - 1;
					set[0].lines[zerolength] = set[0].lines[zerolength].substr(0, startColumn);

					set[1].start.row = startRow + base[i].start.row;
					set[1].end.row = endRow + base[i].start.row;
					set[1].start.column = startColumn + ((zerolength == 0)? set[0].end.column : 0);
					set[1].end.column = endColumn;
					set[1].lines = negative.lines;
					onelength = set[1].lines.length - 1;

					set[2].end.row = endRow + base[i].start.row;
					set[2].end.column = endColumn + ((onelength == 0 && zerolength == 0)? set[0].start.column : 0);
					set[2].lines.splice(0, zerolength + onelength);
					set[2].lines[0] = set[2].lines[0].substr(set[1].lines[onelength].length + ((endRow == startRow)? set[0].lines[zerolength].length : 0));

					set[1].undone = undefined;

					for (var j = set.length - 1; j >= 0; j--) {
						if (set[j].lines.length == 1 && set[j].lines[0] == '') set.splice(j, 1);
					};

					base.splice.apply(base, [i, 1].concat(set));

					negative.lines = [];
					negative.start.row = negative.start.row;
					negative.start.column = negative.start.column;
					i += (set.length - 1);
				} else if (start < 0) {
					console.log('i4.2');
					set = JSON.parse(JSON.stringify([base[i], base[i]]));

					set[0].end.row = startRow + base[i].start.row;
					set[0].end.column = startColumn + ((startRow == 0)? set[0].start.column : 0);
					set[0].lines.splice(startRow + 1);
					zerolength = set[0].lines.length - 1;
					set[0].lines[zerolength] = set[0].lines[zerolength].substr(0, startColumn);

					set[1].start.row = startRow + base[i].start.row;
					set[1].start.column = startColumn + ((zerolength == 0)? set[0].start.column : 0);
					set[1].lines.splice(0, zerolength);
					set[1].lines[0] = set[1].lines[0].substr(startColumn);

					set[1].undone = undefined;

					for (var j = set.length - 1; j >= 0; j--) {
						if (set[j].lines.length == 1 && set[j].lines[0] == '') set.splice(j, 1);
					};

					base.splice.apply(base, [i, 1].concat(set));

					negative.start.row = endRow + base[0].start.row;
					negative.start.column = endColumn + ((endRow == 0)? base[0].start.column : 0);
					negative.lines.splice(0, endRow - startRow);
					negative.lines[0] = negative.lines[0].substr(endColumn - ((endRow == startRow)? startColumn : 0));
					i += (set.length - 1);
				} else if (end < 0) {
					console.log('i4.3');
					set = JSON.parse(JSON.stringify([base[i], base[i]]));

					set[0].start.row = startRow + negative.start.row;
					set[0].end.row = endRow + negative.start.row;
					set[0].start.column = startColumn + ((startRow == 0)? negative.start.column : 0);
					set[0].end.column = endColumn + ((endRow == 0)? negative.start.column : 0);
					set[0].lines.splice(endRow + 1 - startRow);
					zerolength = set[0].lines.length - 1;
					set[0].lines[zerolength] = set[0].lines[zerolength].substr(0, endColumn)

					set[1].start.row = endRow + negative.start.row;
					set[1].start.column = endColumn + ((endRow == 0)? negative.start.column : 0);
					set[1].lines.splice(0, endRow - startRow);
					set[1].lines[0] = set[1].lines[0].substr(endColumn);

					set[0].undone = undefined;

					for (var j = set.length - 1; j >= 0; j--) {
						if (set[j].lines.length == 1 && set[j].lines[0] == '') set.splice(j, 1);
					};

					base.splice.apply(base, [i, 1].concat(set));

					negative.end.row = endRow + negative.start.row;
					negative.end.column = endColumn + ((endRow == 0)? negative.start.column : 0);
					negative.lines.splice(startRow+1);
					neglength = negative.lines.length - 1;
					negative.lines[neglength] = negative.lines[neglength].substr(0,startColumn); 
					i += (set.length - 1);
				} else {
					console.log('i4.4');
					base[i].start.row = negative.start.row + startRow;
					base[i].start.column = startColumn + ((startRow == 0)? negative.start.column : 0);
					base[i].end.row = negative.start.row + endRow;
					base[i].end.column = endColumn + ((startRow == 0 && startRow == endRow)? negative.start.column : 0);

					base[i].undone = undefined;

					neg2 = JSON.parse(JSON.stringify(negative));
					neg2.end.row = neg2.start.row + startRow;
					neg2.end.column = startColumn + ((startRow == 0)? neg2.start.column : 0);
					neg2.lines.splice(startRow + 1);
					neg2.lines[startRow] = neg2.lines[startRow].substr(0, startColumn);

					base2 = [];
					for (var j = i + 1; j < base.length; j++) base2.push(base[j]);

					var placeholder = i;

					console.log('level down');
					subtractDeltas(base2, neg2);
					console.log('level up');

					i = placeholder

					negative.start.row = base[i].end.row;
					negative.start.column = base[i].end.column;
					negative.lines.splice(0, endRow);
					negative.lines[0] = negative.lines[0].substr(endColumn - ((endRow == 0 && startRow == 0)? startColumn : 0));
				}
			}
		} else {
			if (negative.end.row < base[i].start.row) {
				console.log('r1')
				length = negative.lines.length - 1;
				base[i].start.row -= length;
				base[i].end.row -= length;
			} else if (negative.end.row == base[i].start.row && negative.end.column <= base[i].start.column) {
				console.log('r2')
				vertLength = negative.lines.length - 1;
				horiLength = negative.lines[vertLength].length

				base[i].start.row -= vertLength;
				base[i].end.row -= vertLength;
				base[i].start.column -= (vertLength == 0) ? horiLength : horiLength - negative.start.column;
				if (base[i].start.row == base[i].end.row) base[i].end.column -= (vertLength == 0) ? horiLength : horiLength - negative.start.column;
			} else if (negative.start.row > base[i].end.row || (negative.start.column >= base[i].end.column && negative.start.row == base[i].end.row)) {
				console.log('r3')
				continue;
			} else {
				console.log('r4')
				var baseStr = '';
				var negativeStr = '';

				for (j in base[i].lines) baseStr += (j > 0)? '\n' + base[i].lines[j] : base[i].lines[j];
				for (j in negative.lines) negativeStr += (j > 0)? '\n' + negative.lines[j] : negative.lines[j];

				// positive values deal with location in negative string
				// negative values deal with location in base string

				var start;
				var end;

				var len = 0;

				if (base[i].start.row < negative.start.row || (base[i].start.row == negative.start.row && base[i].start.column < negative.start.column)) {
					for (var j = 1; j < baseStr.length; j++) {
						cap = Math.min(negativeStr.length, j)
						if (baseStr.substr(baseStr.length - j, cap) == negativeStr.substr(0,cap)) {
							len = cap;
							start = j - baseStr.length;
							end = (j >= negativeStr.length)? start - cap: cap; 
						}
					}
				} else if (base[i].start.row > negative.start.row || (base[i].start.row == negative.start.row && base[i].start.column > negative.start.column)) {
					for (var j = 0; j < negativeStr.length; j++) {
						cap = Math.min(baseStr.length, j);
						if (negativeStr.substr(negativeStr.length - j, cap) == baseStr.substr(0,cap)) {
							len = cap;
							start = negativeStr.length - j;
							end = (j >= baseStr.length)? start + cap : -cap;
						}
					}
				} else {
					for (var j = 1; j <= baseStr.length; j++) {
						cap = Math.min(negativeStr.length, j)
						if (baseStr.substr(baseStr.length - j, cap) == negativeStr.substr(0,cap)) {
							len = cap;
							start = j - baseStr.length;
							end = (j >= negativeStr.length)? start - cap: cap; 
						}
					}

					for (var j = 0; j <= negativeStr.length; j++) {
						cap = Math.min(baseStr.length, j);
						if (negativeStr.substr(negativeStr.length - j, cap) == baseStr.substr(0,cap) && cap > len) {
							len = cap;
							start = negativeStr.length - j;
							end = (j >= baseStr.length)? start + cap : -cap;
						}
					}
				}

				console.log('base\n' + baseStr);
				console.log('nega\n' + negativeStr);

				console.log('start: '+ start);
				console.log('end: '+ end);

				if (start == undefined) {
					continue;
				}

				if (start < 0) {
					startRow = (baseStr.substr(0, Math.abs(start)).match(/\n/g) || []).length;
					startColumn = Math.abs(start) - ((start == 0)? 0 : (baseStr.lastIndexOf('\n', Math.abs(start)-1) + 1))// + ((startRow == 0)? base[i].start.column : 0);		
				
					if (end < 0) {
						endRow = (baseStr.substr(0, Math.abs(end)).match(/\n/g) || []).length;
						endColumn = Math.abs(end) - (baseStr.lastIndexOf('\n', Math.abs(end)-1)+1) + ((0 == endRow)? startColumn : 0);
					} else {
						endRow = (baseStr.substr(0, baseStr.length - 1).match(/\n/g) || []).length;
						endColumn = len - (negativeStr.lastIndexOf('\n', len-1)+1) + ((startRow == endRow)? startColumn : 0);
					}
				} else {
					startRow = (negativeStr.substr(0, Math.abs(start)).match(/\n/g) || []).length;
					startColumn = Math.abs(start) - ((start == 0)? 0 : (negativeStr.lastIndexOf('\n', Math.abs(start)-1) + 1))// + ((startRow == 0)? negative.start.column : 0);		
				
					if (end > 0) {
						endRow = (negativeStr.substr(0, Math.abs(end)).match(/\n/g) || []).length;
						endColumn = Math.abs(end) - (negativeStr.lastIndexOf('\n', Math.abs(end)-1)+1) + ((0 == endRow)? startColumn : 0);
					} else {
						endRow = (negativeStr.substr(0, negativeStr.length - 1).match(/\n/g) || []).length;
						endColumn = len - (baseStr.lastIndexOf('\n', len-1)+1) + ((startRow == endRow)? startColumn : 0);
					}
				}

				console.log('startRow: '+startRow+' startColumn: '+startColumn);
				console.log('endRow: '+endRow+' endColumn: '+endColumn);

				if (start < 0 && end < 0) {
					console.log('r4.1');
					set = JSON.parse(JSON.stringify([base[i], base[i], base[i]]));
					
					set[0].end.row = startRow + base[i].start.row;
					set[0].end.column = startColumn + ((startRow == 0)? set[0].start.column : 0);
					set[0].lines.splice(startRow + 1);
					zerolength = set[0].lines.length - 1;
					set[0].lines[zerolength] = set[0].lines[zerolength].substr(0, startColumn);

					console.log('endRow: '+endRow)
					console.log('baseRow: '+base[i].start.row)
					set[1].start.row = startRow + base[i].start.row;
					set[1].end.row = endRow + base[i].start.row;
					set[1].start.column = startColumn + ((zerolength == 0)? set[0].end.column : 0);
					set[1].end.column = endColumn;
					set[1].lines = negative.lines;
					onelength = set[1].lines.length - 1;

					set[2].start.row = endRow + base[i].start.row;
					set[2].start.column = endColumn + ((onelength == 0 && zerolength == 0)? set[0].start.column : 0);
					set[2].lines.splice(0, zerolength + onelength);
					console.log('onelength: '+onelength+' line: '+set[1].lines[onelength].length);
					set[2].lines[0] = set[2].lines[0].substr(set[1].lines[onelength].length + ((endRow == startRow)? set[0].lines[zerolength].length : 0));

					set[1].undone = true;

					for (var j = set.length - 1; j >= 0; j--) {
						console.log('Testing j=' + j)
						console.log(JSON.stringify(set[j]))
						if (set[j].lines.length == 1 && set[j].lines[0] == '') console.log(set.splice(j, 1));
					};

					base.splice.apply(base, [i, 1].concat(set));

					negative.lines = [];
					negative.end.row = negative.start.row;
					negative.end.column = negative.start.column;
					i += (set.length - 1);
				} else if (start < 0) {
					console.log('r4.2');
					set = JSON.parse(JSON.stringify([base[i], base[i]]));

					set[0].end.row = startRow + base[i].start.row;
					set[0].end.column = startColumn + ((startRow == 0)? set[0].start.column : 0);
					set[0].lines.splice(startRow + 1);
					zerolength = set[0].lines.length - 1;
					set[0].lines[zerolength] = set[0].lines[zerolength].substr(0, startColumn);

					set[1].start.row = startRow + base[i].start.row;
					set[1].start.column = startColumn + ((zerolength == 0)? set[0].start.column : 0);
					set[1].lines.splice(0, zerolength);
					set[1].lines[0] = set[1].lines[0].substr(startColumn);

					set[1].undone = true;

					for (var j = set.length - 1; j >= 0; j--) {
						if (set[j].lines.length == 1 && set[j].lines[0] == '') set.splice(j, 1);
					};

					base.splice.apply(base, [i, 1].concat(set));

					negative.start.row = endRow + base[0].start.row;
					negative.start.column = endColumn + ((endRow == 0)? base[0].start.column : 0);
					negative.lines.splice(0, endRow - startRow);
					negative.lines[0] = negative.lines[0].substr(endColumn - ((endRow == startRow)? startColumn : 0));
					i += (set.length - 1);
				} else if (end < 0) {
					console.log('r4.3');
					set = JSON.parse(JSON.stringify([base[i], base[i]]));

					set[0].start.row = negative.start.row;
					set[0].end.row = negative.start.row + endRow - startRow;
					set[0].start.column = negative.start.column;
					set[0].end.column = negative.start.column + endColumn - ((endRow == startRow)? startColumn : 0);//endColumn + ((endRow == 0)? negative.start.column : 0);
					set[0].lines.splice(endRow + 1 - startRow);
					console.log(set[0].lines);
					zerolength = set[0].lines.length - 1;
					set[0].lines[zerolength] = set[0].lines[zerolength].substr(0, endColumn - ((endRow == startRow)? startColumn : 0))

					set[1].start.row = set[0].end.row;
					set[1].start.column = set[0].end.column;
					set[1].lines.splice(0, endRow - startRow);
					set[1].lines[0] = set[1].lines[0].substr(endColumn - ((endRow == startRow)? startColumn : 0));
					set[1].end.row = set[0].end.row + set[1].lines.length - 1;
					set[1].end.column = set[1].lines[set[1].lines.length-1].length + ((set[1].lines.length - zerolength == 1)? set[0].end.column : 0);

					for (var j = set.length - 1; j >= 0; j--) {
						if (set[j].lines.length == 1 && set[j].lines[0] == '') set.splice(j, 1);
					};

					set[0].undone = true;

					base.splice.apply(base, [i, 1].concat(set));

					negative.end.row = negative.start.row + endRow - startRow;
					negative.end.column = endColumn + ((endRow == 0)? negative.start.column : 0);
					negative.lines.splice(startRow+1);
					neglength = negative.lines.length - 1;
					negative.lines[neglength] = negative.lines[neglength].substr(0,startColumn);
					i += (set.length - 1); 
				} else {
					console.log('r4.4');
					base[i].start.row = negative.start.row;
					base[i].start.column = negative.start.column;
					base[i].end.row = negative.start.row + endRow - startRow;
					base[i].end.column = base[i].lines[base[i].lines.length-1].length + ((base[i].lines.length == 1)? base[i].start.column : 0);

					base[i].undone = true;
				}				
			}
		}
	}

	return base;
}

var EditorUpdate = function(event, html) {
	this.event = event;
	this.html = html;
	this.file = getDirectory();
	this.id = socket.id;
}
var ChangeSelectUpdate = function(ranges, path) {
	this.ranges = ranges;
	this.path = path;
}

$(document).ready(function() {
	var editor = ace.edit('editor');
	editor.setTheme("ace/theme/idle_fingers");

	var Undo = function() {
		console.log('Undo')
		delta = JSON.parse(JSON.stringify(userDeltas[historyPointer]));

		if (historyPointer == 0) return;
		else historyPointer--;

		console.log(JSON.stringify(deltas))

		for (var i = 1 + delta.pointer; i < deltas.length; i++) {
			delta.delta = subtractDeltas(delta.delta, JSON.parse(JSON.stringify(deltas[i])));
			console.log(JSON.stringify(deltas[i]))
			console.log(JSON.stringify(delta.delta))
		}

		if (delta.delta[0].action == 'remove') {
			for (var i = 0; i < delta.delta.length; i++) {
				delta.delta[i].action = 'insert';

				if (delta.delta[i].undone && i < delta.delta.length - 1) {
					var neg = delta.delta.splice(i, 1)[0];
					var subbase = delta.delta.splice(i, delta.delta.length - i);

					console.log('subtracting:\n'+JSON.stringify(neg)+'\nfrom:\n'+JSON.stringify(subbase));
					delta.delta = delta.delta.concat(subtractDeltas(subbase, neg));
				}

				delta.delta[i].action = 'insert';

				console.log('applying[i]: ' + JSON.stringify(delta.delta))
				preUpdateFlag = true;
				preUndoRedoFlag = true;
				editor.session.getDocument().applyDeltas([delta.delta[i]]);
			}
		} else if (delta.delta[0].action == 'insert') {
			for (var i = 0; i < delta.delta.length; i++) {
				delta.delta[i].action = 'remove';

				if (delta.delta[i].undone && i < delta.delta.length - 1) {
					var neg = delta.delta.splice(i, 1)[0];
					neg.undone = undefined;
					var subbase = delta.delta.splice(i, delta.delta.length - i);

					delta.delta = delta.delta.concat(subtractDeltas(subbase, neg));
				}

				delta.delta[i].action = 'remove';
			}

			for (var i = delta.delta.length - 1; i >= 0; i--) {
				console.log('applying[i]: ' + JSON.stringify(delta.delta))
				preUpdateFlag = true;
				preUndoRedoFlag = true;
				editor.session.getDocument().applyDeltas([delta.delta[i]]);
			}
		}
	}

	var Redo = function() {
		console.log('Redo')

		if (historyPointer == userDeltas.length - 1) return;
		else historyPointer++;

		delta = JSON.parse(JSON.stringify(userDeltas[historyPointer]));

		console.log(delta.delta)
		console.log('delta:' + JSON.stringify(deltas));

		for (i = 1 + delta.pointer; i < deltas.length; i++) {
			delta.delta = subtractDeltas(delta.delta, JSON.parse(JSON.stringify(deltas[i])));
		}

		if (delta.delta[0].action == 'insert') {
			for (var i = 0; i < delta.delta.length; i++) {
				if (delta.delta[i].undone && i < delta.delta.length - 1) {
					var neg = delta.delta.splice(i, 1)[0];
					var subbase = delta.delta.splice(i, delta.delta.length - i);

					delta.delta = delta.delta.concat(subtractDeltas(subbase, neg));
				}

				console.log('applying[i]: ' + JSON.stringify(delta.delta))
				preUpdateFlag = true;
				preUndoRedoFlag = true;
				editor.session.getDocument().applyDeltas([delta.delta[i]]);
			}
		} else if (delta.delta[0].action == 'remove') {
			for (var i = 0; i < delta.delta.length; i++) {
				if (delta.delta[i].undone && i < delta.delta.length - 1) {
					var neg = delta.delta.splice(i, 1)[0];
					var subbase = delta.delta.splice(i, delta.delta.length - i);

					delta.delta = delta.delta.concat(subtractDeltas(subbase, neg));
				}
			}

			for (var i = delta.delta.length - 1; i >= 0; i--) {
				console.log('applying[i]: ' + JSON.stringify(delta.delta))
				preUpdateFlag = true;
				preUndoRedoFlag = true;
				editor.session.getDocument().applyDeltas([delta.delta[i]]);
			}
		}

		userDeltas[historyPointer].pointer = deltas.length - 1;
	}

	editor.commands.addCommand({
		name: 'Undo',
		exec: Undo,
		bindKey: {mac: 'cmd-z', win: 'ctrl-z'}
	});
	editor.commands.addCommand({
		name: 'Redo',
		exec: Redo,
		bindKey: {mac: 'cmd-shift-z', win: 'ctrl-shift-z'}
	});
	editor.$blockScrolling = Infinity;

	var preUpdateFlag = true;
	var preUndoRedoFlag = false;

	editor.on('change', function(event) {
		deltas.push(event);

		if(preUpdateFlag && preUndoRedoFlag) {
			preUpdateFlag = false;
			preUndoRedoFlag = false;

			socket.emit('editor-update', new EditorUpdate(event, editor.getValue()));
		} else if (preUpdateFlag) {
			preUpdateFlag = false;
		} else {
			console.log(event);
			//deltaBuffer.push({'delta': event, 'pointer': deltas.length - 1});
			historyPointer++;

			if (historyPointer < userDeltas.length) userDeltas.splice(historyPointer, userDeltas.length - historyPointer);

			userDeltas.push({'delta': [event], 'pointer': deltas.length - 1});
			console.log(userDeltas[userDeltas.length-1].delta[0])
			
			socket.emit('editor-update', new EditorUpdate(event, editor.getValue()));
		}
	});

	editor.selection.on('changeSelection', function() {
		socket.emit('change-select-update', new ChangeSelectUpdate(editor.getSelection().getAllRanges(), getDirectory()));
	})

	socket.on('new-page-update', function(update) {
		if (update.text.length == 0) preUpdateFlag = false;
		editor.setValue(update.text);

		if(update.text != '') {
			for (var i in update.cursors) {
				var index = 0;
				for (var j in update.cursors[i]) {
					if (j != socket.id && update.cursors[i][j]) {
						var mark = new Range(update.cursors[i][j].start.row, update.cursors[i][j].start.column, update.cursors[i][j].end.row, update.cursors[i][j].column);
						markers.push(editor.getSession().addMarker(mark, "other-user-" + (index % 5), "text", false));
						(index % 5)
						index++;
					}
				}
			}
		}
	});

	socket.on('change-select-update', function(update) {

		for (var i = 0; i < markers.length; i++) {
			editor.getSession().removeMarker(markers[i]);
		}

		markers = [];

		var index = 0;
		for (var i in update) {
			for (var j in update[i]) {
				var mark = new Range(update[i][j].start.row, update[i][j].start.column, update[i][j].end.row, update[i][j].end.column);
				if (i != socket.id) {
					markers.push(editor.getSession().addMarker(mark, "other-user-" + (index % 5), "text", false));
					console.log(index % 5);
				}
			}
			index++;
		}
	});

	socket.on('editor-update', function(update) {
		if (update.file === getDirectory() && update.id != socket.id) {
			preUpdateFlag = true;
			editor.session.getDocument().applyDeltas([update.event]);
		}
	});

	socket.on('file-move-update', function(update) {
		var directory = getDirectory();

		if (update.filedir === directory) {
			alert("Warning: this directory has been moved to " + update.newFileDir);
			$("meta[name='directory']")[0].content = update.newFileDir;
		} else if (directory.indexOf(update.filedir) > -1) {
			alert("Warning: a parent of this directory has been moved to " + update.newFileDir);
			$("meta[name='directory']")[0].content = update.newFileDir;
		}
		var directory = getDirectory();

		var url = '/directory';
		var form = $('<form class="hidden" action="' + url + '" method="post">' + '<input type="text" name="dir" value="' + directory + '" />' +'</form>');
		$('body').append(form);

		form.submit();
	});

	socket.on('file-delete-update', function(update) {
		var directory = getDirectory();

		if (directory === update || directory.indexOf(update) > -1) {
			alert("Warning: this directory has been unlinked");
			window.location.replace('/');
		}
	});
});