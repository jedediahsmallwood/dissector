var sockets = new Array();

function initForHistoricSeries(series) {
    $('#render' + series).click(function() {
        chart.get('series' + series).setData([]);
        chart.redraw();
        if (validateHistoricSeries(series, $('#ta' + series).val(),
            $('#start').val(),
            $('#stop').val(),
            $('#shift').val())) {
            sockets[series] = renderHistoricData(chart.series[series - 1],
                $('#ta' + series).val(),
                $('#start').val(),
                $('#stop').val(),
                $('#interval').val(),
                $('#shift').val(),
                $('#progressbar' + series),
                $('#stop' + series));
            $('#stop' + series).show();
        }
    });

    initCommonButtons(series);
}

function initForRealTimeSeries(series) {
    $('#render' + series).click(function() {
        chart.get('series' + series).setData([]);
        chart.redraw();
        if (validateRealTimeSeries(series, $('#ta' + series).val(),
            $('#from').val(),
            $('#interval').val())) {
            sockets[series] = renderRealTimeData(chart.series[series - 1],
                $('#ta' + series).val(),
                $('#from').val(),
                $('#interval').val(),
                $('#progressbar' + series),
                $('#stop' + series));
            $('#stop' + series).show();
        }
    });

    initCommonButtons(series);
}

function initCommonButtons(series) {
    $('#clear' + series).click(function() {
        $('#stop' + series).click();
        chart.get('series' + series).setData([]);
        chart.redraw();
    });

    $('#stop' + series).click(function() {
        var socket = sockets[series];

        if (null != socket) {
            socket.close();
        }
        sockets[series] = null;

        $('#progressbar' + series).hide();
        $('#stop' + series).hide();
    });
}

function initBoard(params) {
    if (params['start']) {
        $('#start').val(params['start'])
    }
    if (params['stop']) {
        $('#stop').val(params['stop'])
    }
    if (params['from']) {
        $('#from').val(params['from'])
    }
    if (params['interval']) {
        $('#interval').val(params['interval'])
    }


    for (var i = 1; i <= 6; i++) {
        if (params['series' + i]) {
            $('#ta' + i).val(safeUnescape(params['series' + i]))
        }
    }

    //Do mode specific setup.
    if (params['mode'] == 'realtime') {
        $('#dissectorType').text('Real Time');
        $('#startInput').hide();
        $('#stopInput').hide();
        $('#shiftInput').hide();

        for (var i = 1; i <= 6; i++) {
            initForRealTimeSeries(i);
        }

    } else {
        $('#dissectorType').text('Historic');
        $('#fromInput').hide();

        for (var i = 1; i <= 6; i++) {
            initForHistoricSeries(i);
        }
    }

    for (var i = 1; i <= 6; i++) {
        if ($('#ta' + i).val().trim() != '') {
            $('#render' + i).click();
        }
    }

}

function validateHistoricSeries(series, equation, start, stop, shift) {
    var startTime = new Date(start + 'T00:00:00.000Z');
    var stopTime = new Date(stop + 'T23:59:59.000Z');

    $('#optionsError').hide();
    $('#seriesError' + series).hide();

    var errorPrefix = '<strong>Error: </strong>';

    if (start == '' || stop == '' || startTime.getTime() >= stopTime.getTime()) {
        $('#optionsErrorMessage').html(errorPrefix + 'Specify a start and stop date, and ensure the stop time is >= to start date.');
        $('#optionsError').show('blind');
        return false;
    }

    if (shift == '' || isNaN(parseInt(shift))) {
        $('#optionsErrorMessage').html(errorPrefix + 'Shift must be a number');
        $('#optionsError').show('blind');
        return false;
    }

    if (equation == '') {
        $('#seriesErrorMessage' + series).html(errorPrefix + 'Provide series equation');
        $('#seriesError' + series).show('blind');
        return false;
    }

    return true;
}

function renderHistoricData(series, equation, start, stop, interval, shift, progressBar, stopButton) {
    var start = new Date(start + 'T00:00:00.000Z');
    var stop = new Date(stop + 'T23:59:59.000Z');
    var interval = parseInt(interval);
    var shift = parseInt(shift) * 1000;
    var currentTime = start.getTime() + interval;
    var current = new Date(start.getTime() + interval);
    var socket = getWebSocket();

    progressBar.show('blind');
    progressBar.progressbar("option", "disabled", false);
    progressBar.progressbar("option", "value", 0);

    var totalMetrics = Math.round((stop.getTime() - start.getTime()) / interval);
    var observedMetrics = 0;

    socket.onopen = function() {
        console.info("Socket opened");
        socket.send('{"expression":"' + equation + '","start":"' + start.toISOString() + '", "stop": "' + current.toISOString() + '", "step": ' + interval + '}');
    };

    socket.onmessage = function(event) {
        var d = $.parseJSON(event.data);
        var point = [(new Date(d.time)).getTime() + shift, d.value];
        series.addPoint(point);

        observedMetrics++;
        progressBar.progressbar("option", "value", Math.round((observedMetrics / totalMetrics) * 100));

        if (current.getTime() < stop.getTime()) {
            var next = new Date(current.getTime() + interval);
            socket.send('{"expression":"' + equation + '","start":"' + current.toISOString() + '", "stop": "' + next.toISOString() + '", "step": ' + interval + '}');
            current = next;
        } else {
            console.info("Closing socket");
            socket.close();
            progressBar.progressbar("option", "disabled", true);
            progressBar.hide('blind');
            stopButton.hide();
            chart.redraw();
        }
    };

    return socket;
}

function validateRealTimeSeries(series, equation, from) {

    var fromTime = new Date(from + 'T00:00:00.000Z');

    $('#optionsError').hide();
    $('#seriesError' + series).hide();

    var errorPrefix = '<strong>Error: </strong>';

    if (from == '' || fromTime.getTime() == 0) {
        $('#optionsErrorMessage').html(errorPrefix + 'Specify a valid from date');
        $('#optionsError').show('blind');
        return false;
    }

    if (equation == '') {
        $('#seriesErrorMessage' + series).html(errorPrefix + 'Provide series equation');
        $('#seriesError' + series).show('blind');
        return false;
    }

    return true;
}

function renderRealTimeData(series, equation, from, interval, progressBar, stopButton) {
    var from = new Date(from + 'T00:00:00.000Z');
    var interval = parseInt(interval);
    var stop = new Date((new Date()).getTime() - interval);
    var current = new Date(from.getTime() + interval);
    var next;
    var socket = getWebSocket();
    var shiftingMode = false;

    progressBar.show('blind');
    progressBar.progressbar("option", "disabled", false);
    progressBar.progressbar("option", "value", 100);

    socket.onopen = function() {
        console.info("Socket opened");
        socket.send('{"expression":"' + equation + '","start":"' + from.toISOString() + '", "stop": "' + current.toISOString() + '", "step": ' + interval + '}');
    };

    socket.onmessage = function(event) {
        var d = $.parseJSON(event.data);
        var point = [(new Date(d.time)).getTime(), d.value];

        if (!shiftingMode && (current.getTime() >= stop.getTime())) {
            shiftingMode = true;
            chart.redraw();
        }

        series.addPoint(point, true, shiftingMode);

        if (!shiftingMode) {
            next = new Date(current.getTime() + interval);
            socket.send('{"expression":"' + equation + '","start":"' + current.toISOString() + '", "stop": "' + next.toISOString() + '", "step": ' + interval + '}');
            current = next;
        } else {
            next = new Date(current.getTime() + interval);
            var timeout = next.getTime() - (new Date()).getTime();

            if (timeout <= 0) {
                timeout = interval;
            }
            console.info('Setting timeout for ' + timeout + ' ms');
            setTimeout(function() {
                socket.send('{"expression":"' + equation + '","start":"' + current.toISOString() + '", "stop": "' + next.toISOString() + '", "step": ' + interval + '}');
                current = next;
            }, timeout);
        }
    };

    return socket;

}

function generateShareLink(board) {

    var url = window.location.protocol + '//' + window.location.pathname + '?';

    for (var name in board) {
        if (board.hasOwnProperty(name)) {
            if (null != board[name] && board[name] != '') {
                url = url + name + '=' + safeEscape(board[name]) + '&';
            }
        }
    }

    return url;
}

function safeEscape(value) {
    return encodeURI(value).replace('\'', '%27').replace('(', '%28').replace(')', '%29');
}

function safeUnescape(value) {
    return decodeURI(value).replace('%27', '\'').replace('%28', '(').replace('%29', ')');
}

function getUrlVars() {
    var vars = [], hash;
    var hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');
    for (var i = 0; i < hashes.length; i++) {
        hash = hashes[i].split('=');
        vars.push(hash[0]);
        vars[hash[0]] = hash[1];
    }
    return vars;
}

function getWebSocket() {
    if (null == config) {
        return new WebSocket('ws://localhost:1081/1.0/metric/get');
    } else {
        return new WebSocket('ws://' + config.cubeServer + '/1.0/metric/get');
    }
}