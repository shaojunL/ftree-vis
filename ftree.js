$(document).ready(docMain);

var conf = new Object();
conf['depth'] = 3;
conf['width'] = 8;
conf['gpuRackPct'] = 25;
conf['gpuDemand'] = 4;
conf['gpuUplinkBoost'] = 2;
conf['edgeOversub'] = 2;

var controlVisible = true;
var lastMetrics = null;

function docMain() {
    formInit();
    redraw();
    $(document).keypress(kpress);
}

function kpress(e) {
    if (e.which == 104) { // 'h'
        if (controlVisible) {
            controlVisible = false;
            $("div.control").hide();
        } else {
            controlVisible = true;
            $("div.control").show();
        }
    }
}

function redraw() {
    lastMetrics = drawFatTree(conf['depth'], conf['width']);
    updateStat();
}

function drawFatTree(depth, width) {
    var k = Math.floor(width / 2);
    var padg = 13;
    var padi = 12;
    var hline = 70;
    var hhost = 50;

    var podw = 8;
    var podh = 8;
    var hostr = 2;

    var kexp = function (n) { return Math.pow(k, n); };

    d3.select("svg.main").remove();   
    if (kexp(depth - 1) > 1500 || depth <= 0 || k <= 0) {
        return null;
    }

    var gpuRackPct = Math.max(0, Math.min(100, conf['gpuRackPct'] || 0));
    var gpuDemand = Math.max(1, conf['gpuDemand'] || 1);
    var gpuUplinkBoost = Math.max(1, conf['gpuUplinkBoost'] || 1);
    var edgeOversub = Math.max(1, conf['edgeOversub'] || 1);

    var w = kexp(depth - 1) * padg + 200;
    var h = (2 * depth) * hline;

    var svg = d3.select("body").append("svg")
        .attr("width", w)
        .attr("height", h)
        .attr("class", "main")
        .append("g")
        .attr("transform", "translate(" + w/2 + "," + h/2 + ")");

    var linePositions = [];

    var totalEdgePerSide = kexp(depth - 1);
    var totalRacks = totalEdgePerSide * 2;
    var gpuRackCount = Math.floor((gpuRackPct / 100) * totalRacks);

    function isGpuRack(sideSign, edgeIndex) {
        var globalIndex = sideSign > 0 ? edgeIndex : (totalEdgePerSide + edgeIndex);
        return globalIndex < gpuRackCount;
    }

    var hotUplinks = 0;
    var maxUplinkUtil = 0;

    function podPositions(d) {
        var ret = [];

        var ngroup = kexp(d);
        var pergroup = kexp(depth - 1 - d);

        var wgroup = pergroup * padg;
        var wgroups = wgroup * (ngroup - 1);
        var offset = -wgroups/2;

        for (var i = 0; i < ngroup; i++) {
            var wpods = pergroup * padi;
            var goffset = wgroup * i - wpods/2;
            
            for (var j = 0; j < pergroup; j++) {
                ret.push(offset + goffset + padi * j);
            }
        }

        return ret
    }

    for (var i = 0; i < depth; i++) {
        linePositions[i] = podPositions(i);
    }

    function drawPods(list, y, sideSign) {
        for (var j = 0, n = list.length; j < n; j++) {
            var classes = "pod";
            if (Math.abs(y) === (depth - 1) * hline && isGpuRack(sideSign, j)) {
                classes += " gpu-rack";
            }

            svg.append("rect")
                .attr("class", classes)
                .attr("width", podw)
                .attr("height", podh)
                .attr("x", list[j] - podw/2)
                .attr("y", y - podh/2);
        }
    }

    function drawHost(x, y, dy, dx) {
        svg.append("line")
            .attr("class", "cable")
            .attr("x1", x)
            .attr("y1", y)
            .attr("x2", x + dx)
            .attr("y2", y + dy);

        svg.append("circle")
            .attr("class", "host")
            .attr("cx", x + dx)
            .attr("cy", y + dy)
            .attr("r", hostr);
    }

    function drawHosts(list, y, direction) {
        for (var i = 0; i < list.length; i++) {
            if (k == 1) {
                drawHost(list[i], y, hhost * direction, 0);
            } else if (k == 2) {
                drawHost(list[i], y, hhost * direction, -2);
                drawHost(list[i], y, hhost * direction, +2);
            } else if (k == 3) {
                drawHost(list[i], y, hhost * direction, -4);
                drawHost(list[i], y, hhost * direction, 0);
                drawHost(list[i], y, hhost * direction, +4);
            } else {
                drawHost(list[i], y, hhost * direction, -4);
                drawHost(list[i], y, hhost * direction, 0);
                drawHost(list[i], y, hhost * direction, +4);
            }
        }
    }
    
    function linePods(level, list1, list2, y1, y2, sideSign) {
        var pergroup = kexp(depth - 1 - level);
        var ngroup = kexp(level);

        var perbundle = pergroup / k;
        
        for (var i = 0; i < ngroup; i++) {
            var offset = pergroup * i;
            for (var j = 0; j < k; j++) {
                var boffset = perbundle * j;
                for (var t = 0; t < perbundle; t++) {
                    var ichild = offset + boffset + t;
                    for (var lane = 0; lane < k; lane++) {
                        var ifather = offset + perbundle * lane + t;
                        var classes = "cable";
                        var strokeWidth = 1;

                        if (level === depth - 2) {
                            var gpuRack = isGpuRack(sideSign, ichild);
                            var rackDemand = gpuRack ? gpuDemand : 1;
                            var linkLoad = rackDemand / k;
                            var linkCap = (gpuRack ? gpuUplinkBoost : 1) / edgeOversub;
                            var util = linkLoad / linkCap;

                            if (util > maxUplinkUtil) {
                                maxUplinkUtil = util;
                            }
                            if (util > 1) {
                                hotUplinks++;
                            }

                            if (util > 1) {
                                classes += " hot";
                            } else if (util > 0.7) {
                                classes += " warm";
                            }

                            strokeWidth = 1 + (gpuRack ? 1 : 0) + Math.min(1.5, linkCap * 0.4);
                        }

                        svg.append("line")
                            .attr("class", classes)
                            .attr("stroke-width", strokeWidth)
                            .attr("x1", list1[ifather])
                            .attr("y1", y1)
                            .attr("x2", list2[ichild])
                            .attr("y2", y2);
                    }
                }
            }
        }
    }

    for (var i = 0; i < depth - 1; i++) {
        linePods(i, linePositions[i], linePositions[i + 1], i * hline, (i + 1) * hline, 1);
        linePods(i, linePositions[i], linePositions[i + 1], -i * hline, -(i + 1) * hline, -1);
    }

    drawHosts(linePositions[depth - 1], (depth - 1) * hline, 1);
    drawHosts(linePositions[depth - 1], -(depth - 1) * hline, -1);

    for (var i = 0; i < depth; i++) {
        if (i == 0) {
            drawPods(linePositions[0], 0, 1);
        } else {
            drawPods(linePositions[i], i * hline, 1);
            drawPods(linePositions[i], -i * hline, -1);
        }
    }

    return {
        totalRacks: totalRacks,
        gpuRackCount: gpuRackCount,
        hotUplinks: hotUplinks,
        maxUplinkUtil: maxUplinkUtil,
        ecmpPaths: kexp(Math.max(0, depth - 1))
    };
}

function updateStat() {
    var w = Math.floor(conf['width'] / 2);
    var d = conf['depth'];
    if (d == 0 || w == 0) {
        d3.select("#nhost").html("&nbsp;");
        d3.select("#nswitch").html("&nbsp;");
        d3.select("#ncable").html("&nbsp;");
        d3.select("#ntx").html("&nbsp;");
        d3.select("#nswtx").html("&nbsp;");
        d3.select("#nrack").html("&nbsp;");
        d3.select("#ngpurack").html("&nbsp;");
        d3.select("#nhot").html("&nbsp;");
        d3.select("#nmaxutil").html("&nbsp;");
        d3.select("#npaths").html("&nbsp;");
        return;
    }
    
    var line = Math.pow(w, d - 1);

    var nhost = 2 * line * w;
    var nswitch = (2 * d - 1) * line;
    var ncable = (2 * d) * w * line;
    var ntx = 2 * (2 * d) * w * line;
    var nswtx = ntx - nhost;

    d3.select("#nhost").html(formatNum(nhost));
    d3.select("#nswitch").html(formatNum(nswitch));
    d3.select("#ncable").html(formatNum(ncable));
    d3.select("#ntx").html(formatNum(ntx));
    d3.select("#nswtx").html(formatNum(nswtx));

    if (!lastMetrics) {
        d3.select("#nrack").html("&nbsp;");
        d3.select("#ngpurack").html("&nbsp;");
        d3.select("#nhot").html("&nbsp;");
        d3.select("#nmaxutil").html("&nbsp;");
        d3.select("#npaths").html("&nbsp;");
        return;
    }

    d3.select("#nrack").html(formatNum(lastMetrics.totalRacks));
    d3.select("#ngpurack").html(formatNum(lastMetrics.gpuRackCount));
    d3.select("#nhot").html(formatNum(lastMetrics.hotUplinks));
    d3.select("#nmaxutil").html(lastMetrics.maxUplinkUtil.toFixed(2) + "x");
    d3.select("#npaths").html(formatNum(lastMetrics.ecmpPaths));
}

function formatNum(x) {
    x = x.toString();
    var pattern = /(-?\d+)(\d{3})/;
    while (pattern.test(x))
        x = x.replace(pattern, "$1,$2");
    return x;
}

function formInit() {
    var form = d3.select("form");

    function confInt() { 
        conf[this.name] = parseInt(this.value); 
        redraw();
    }

    function confFloat() {
        conf[this.name] = parseFloat(this.value);
        redraw();
    }

    function hook(name, func) {
        var fields = form.selectAll("[name=" + name + "]");
        fields.on("change", func);
        fields.each(func);
    }

    hook("depth", confInt);
    hook("width", confInt);
    hook("gpuRackPct", confFloat);
    hook("gpuDemand", confFloat);
    hook("gpuUplinkBoost", confFloat);
    hook("edgeOversub", confFloat);
}

