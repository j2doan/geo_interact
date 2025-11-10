console.log('hello');
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import * as topojson from 'https://cdn.jsdelivr.net/npm/topojson-client@3/+esm';



// ---------- INITIAL FUNCTIONS ----------



// GET DATA
async function loadFireData() {
    try {
        const response = await fetch('./datasets/fires.json');
        const firedata = await response.json();
        return firedata;
    } catch (error) {
        console.error('Error loading fire data:', error);
    }
}



// ---------- BUTTON FUNCTIONS ----------



// DAY/NIGHT TOGGLE
let daynightFilter = localStorage.getItem('daynight') || 'D';  // GET FROM LOCAL STORAGE OR DEFAULT
const dayToggle = document.getElementById('dayToggle');
dayToggle.addEventListener('click', () => {
    // THE ACTUAL FILTER (AND VISUAL CHANGES)
    daynightFilter = daynightFilter === 'D' ? 'N' : 'D';
    setButtonText(dayToggle, daynightFilter);
    updatePageColors(daynightFilter);
    console.log('day set: ', daynightFilter);

    // UPDATE DATA BASED ON FILTER APPLIED
    loadAndPlot();
});



// DATE SLIDER
const dates = [
    "2025-10-27",
    "2025-10-28",
    "2025-10-29",
    "2025-10-30",
    "2025-10-31",
    "2025-11-01",
    "2025-11-02",
    "2025-11-03"
];

const dateSlider = document.getElementById('dateSlider');
const dateLabel = document.getElementById('dateLabel');

let selectedDate = localStorage.getItem('date') || dates[0];
let currentIndex = dates.indexOf(selectedDate);
if (currentIndex === -1) currentIndex = 0;
dateSlider.value = currentIndex;
dateLabel.textContent = dates[currentIndex];

dateSlider.addEventListener('input', () => {
    const idx = +dateSlider.value;
    selectedDate = dates[idx];
    localStorage.setItem('date', selectedDate);
    dateLabel.textContent = selectedDate;
    console.log('date set:', selectedDate);

    loadAndPlot();
});



// DATE SELECTOR
// let selectedDate = localStorage.getItem('date') || '2025-10-27';  // GET FROM LOCAL STORAGE OR DEFAULT
// const pickDate = document.getElementById('pickDate');
// pickDate.addEventListener('change', () => {
//     // THE ACTUAL FILTER (AND VISUAL CHANGES)
//     selectedDate = pickDate.value;
//     localStorage.setItem('date', selectedDate); // SAVE PREFERENCE FOR REFRESH
//     console.log('date set: ', selectedDate);

//     // UPDATE DATA BASED ON FILTER APPLIED
//     loadAndPlot();
// });



// SET BUTTON TEXT (DAY/NIGHT)
function setButtonText(dayToggle, daynightFilter) {
    if (daynightFilter === 'D') {
        dayToggle.textContent = 'Day ☀️';
    } else {
        dayToggle.textContent = 'Night 🌙';
    }
}



// UPDATE PAGE COLORS (WHITE/BLACK BASED ON DAY/NIGHT)
function updatePageColors(daynightFilter) {
    if (daynightFilter === 'D') {
        document.body.classList.add('day');
        document.body.classList.remove('night');
        document.body.classList.remove('nightMode');
    } else {
        document.body.classList.add('night');
        document.body.classList.remove('day');
        document.body.classList.add('nightMode');
    }
    // SAVE PREFERENCE ON REFRESH
    localStorage.setItem('daynight', daynightFilter);
}



// ---------- PLOTTING FUNCTIONS ----------



// FILTER DATA (SELECT SUBSET THAT IS BASED ON DAY/NIGHT AND DATE)
function filterData(fireData, daynightFilter, selectedDate) {
    return fireData.filter(d => {
        const fireDate = d.acq_date.toISOString().split('T')[0];
        const fireDayNight = d.daynight;
        return fireDate === selectedDate && fireDayNight === daynightFilter;
    });
}



// LOAD AND PLOT
async function loadAndPlot() {
    const fireData = await loadFireData();  // Wait until the data is loaded

    // CONVERT DATE FIELD TO DATE OBJ
    fireData.forEach(d => {
        d.acq_date = new Date(d.acq_date);
    });

    // FILTER BASED ON DAY/NIGHT AND DATE
    const filteredData = filterData(fireData, daynightFilter, selectedDate);

    // HELPER FUNC, CHECK WHETHER COORDS WITHIN US BORDERS
    function isWithinUS(lon, lat) {
        return d3.geoContains(usa, [lon, lat]);
    }

    // FILTER OUT COORDS NOT WITHIN US BORDERS
    const validData = filteredData.filter(d => {
        return projection([d.longitude, d.latitude]) && isWithinUS(d.longitude, d.latitude)
    });

    // DYNAMIC MAP TITLE
    const dayString = daynightFilter === 'D' ? 'Daytime' : 'Nighttime';
    const selectedDateString = selectedDate;
    d3.select('#mapTitle')
        .text(`US Map of ${dayString} Fires on ${selectedDateString}`);

    drawMap(validData);
    drawPlot(validData);
}



// ACTUALLY DRAW THE LEGEND
function drawLegend(svg, legendData) {
    const items = svg.selectAll('.legendItem')
        .data(legendData)
        .join('g')
        .attr('class', 'legendItem')
        .attr('transform', (d, i) => `translate(0, ${i * 25})`);

    items.append('line')
        .attr('x1', 0)
        .attr('x2', 20)
        .attr('y1', 10)
        .attr('y2', 10)
        .attr('stroke', d => d.color)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', d => d.dash);

    items.append('text')
        .attr('x', 25)
        .attr('y', 14)
        .text(d => d.label)
        .style('font-size', '12px')
        .style('fill', 'currentColor');
}



// PLOT KDE CURVE
function drawPlot(filteredData) {
    // CLEAR PREV PLOT
    svg.selectAll('*').remove();

    // GET BRIGHTNESS VECTOR
    const brightnessValues = filteredData.map(d => +d.brightness);

    // SET PLOT MARGINS
    const margin = { top: 20, right: 20, bottom: 50, left: 60 };
    const width = plotwidth - margin.left - margin.right;
    const height = plotheight - margin.top - margin.bottom;

    // SET BANDWIDTH (MAKES SMOOTH KDE CURVE)
    const bandwidth = (d3.max(brightnessValues) - d3.min(brightnessValues)) / 20;

    function kernelEpanechnikov(k) {
        return function(v) {
            v = v / k;
            return Math.abs(v) <= 1 ? 0.75 * (1 - v * v) / k : 0;
        };
    }

    function kernelDensityEstimator(kernel, X) {
        return function(V) {
            return X.map(x => [x, d3.mean(V, v => kernel(x - v))]);
        };
    }

    const xTicks = d3.range(d3.min(brightnessValues), d3.max(brightnessValues),
        (d3.max(brightnessValues) - d3.min(brightnessValues)) / 200
    );

    // GET THE ACTUAL KDE VECTOR
    kde = kernelDensityEstimator(kernelEpanechnikov(bandwidth), xTicks)(brightnessValues);

    // SCALES
    xScale = d3.scaleLinear()
        .domain([d3.min(brightnessValues), d3.max(brightnessValues)])
        .range([0, width]);

    yScale = d3.scaleLinear()
        .domain([0, d3.max(kde, d => d[1])])
        .range([height, 0]);

    // CREATE GROUP FOR PLOTTING (WHERE AND WHAT YOU ARE GOING TO PLOT)
    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // AXES
    g.append('g')
        .attr('transform', `translate(0, ${height})`)
        .call(d3.axisBottom(xScale).ticks(10));

    g.append('g')
        .call(d3.axisLeft(yScale).ticks(5));

    // AXES LABLES
    g.append("text")
        .attr("class", "axis-label")
        .attr("text-anchor", "middle")
        .attr("x", width / 2)
        .attr("y", height + margin.bottom / 1.5)
        .text("Brightness (Kelvin)")
        .style("font-weight", "bold");

    g.append("text")
        .attr("class", "axis-label")
        .attr("text-anchor", "middle")
        .attr("transform", `rotate(-90)`)
        .attr("x", -height / 2)
        .attr("y", -margin.left / 1.5)
        .text("Density")
        .style("font-weight", "bold");

    // DRAW KDE LINE
    const line = d3.line()
        .curve(d3.curveBasis)
        .x(d => xScale(d[0]))
        .y(d => yScale(d[1]));

    g.append('path')
        .datum(kde)
        .attr('fill', 'none')
        .attr('stroke', 'steelblue')
        .attr('stroke-width', 2)
        .attr('d', line);

    // ADD MEAN AND MEDIAN LINES
    const mean = d3.mean(brightnessValues);
    const median = d3.median(brightnessValues);

    svg.append('line')
    .attr('x1', xScale(mean) + margin.left)
    .attr('x2', xScale(mean) + margin.left)
    .attr('y1', margin.top)
    .attr('y2', plotheight - margin.bottom)
    .attr('stroke', 'purple')
    .attr("stroke-width", 2)
    .attr('stroke-dasharray', '4 2')
    .attr('opacity', 0.7);

    svg.append('line')
    .attr('x1', xScale(median) + margin.left)
    .attr('x2', xScale(median) + margin.left)
    .attr('y1', margin.top)
    .attr('y2', plotheight - margin.bottom)
    .attr('stroke', 'green')
    .attr("stroke-width", 2)
    .attr('stroke-dasharray', '2 2')
    .attr('opacity', 0.7);

    const meanmedian = d3.select('#meanmedian')
    meanmedian
        .style('display', 'block')
        .html(`
            <strong>Fire Subset Info</strong><br><br>
            <strong>Mean Brightness:</strong> ${mean.toFixed(2)}<br>
            <strong>Median Brightness:</strong> ${median.toFixed(2)}<br>
        `);

    // GRIDLINES
    function makeXGridlines() {
        return d3.axisBottom(xScale)
            .ticks(10);
    }

    function makeYGridlines() {
        return d3.axisLeft(yScale)
            .ticks(5);
    }

    g.append("g")
        .attr("class", "grid grid-x")
        .attr("transform", `translate(0, ${height})`)
        .call(makeXGridlines()
            .tickSize(-height)
            .tickFormat("")
        );

    g.append("g")
        .attr("class", "grid grid-y")
        .call(makeYGridlines()
            .tickSize(-width)
            .tickFormat("")
        );

    // SET MEAN/MEDIAN LEGEND DATA (ALWAYS DEFAULT)
    let legendData = [
        { label: "Mean Brightness", color: "purple", dash: "4 2" },
        { label: "Median Brightness", color: "green", dash: "2 2" }
    ];

    drawLegend(legendSvg, legendData);

    // RESET TOOLTIP BAR
    d3.select('#tooltipBar').style('display', 'none');
}



// PLOT COORDS ON MAP
function drawMap(filteredData) {
    // TOOLTIP BAR FOR DISPLAYING LAT, LON, BRIGHTNESS VAL FOR THE SELECTED DOT/FIRE
    const tooltipBar = d3.select('#tooltipBar');
    // KEEP TRACK OF THE SELECTED DOT/FIRE
    let selectedDot = null;

    // PLOT ALL THE DATA POINTS AS CIRCLES BASED ON COORDINATES
    const circles = mapSvg.selectAll('circle')
        .data(filteredData)
        .join('circle')
        .attr('r', 4)
        .attr('fill', d => colorScale(d.brightness)) // SET THEIR COLOR BASED ON BRIGHTNESS
        .attr('opacity', 0.7)
        .on('mouseenter', (event, d) => { // MAKES MOUSE TURN INTO POINTER WHEN HOVER OVER DOT
            d3.select(event.currentTarget)
            .style('cursor', 'pointer');
        })
        .on('mouseleave', (event) => {
            d3.select(event.currentTarget)
            .style('cursor', 'default');
        })
        // WHEN SELECT A FIRE
        .on('click', (event, d) => {
            event.stopPropagation(); // IF YOU CLICK ON SAME DOT AGAIN WHILE IT IS ACTIVE, IT WILL NOT DEACTIVATE

            // DESELECT PREVIOUS DOT IF THERE IS ONE
            if (selectedDot) {
                selectedDot.attr('fill', d => colorScale(d.brightness))
                        .attr('stroke', null)
                        .attr('stroke-width', null);
            }

            // MARK CURRENT DOT AS SELECTED (ACTIVATE)
            selectedDot = d3.select(event.currentTarget);

            // CHANGE ACTIVE DOT COLOR TO BLUE WITH GLOW
            selectedDot
                .attr('fill', 'steelblue')
                .attr('stroke', 'skyblue')
                .attr('stroke-width', 2);

            // REMOVE EXISTING VERTICAL LINE ON KDE PLOT (REGARDLESS IF THERE IS ONE OR NOT)
            svg.selectAll('line.kdePoint').remove();

            // ADD VERTICAL LINE TO KDE PLOT WITH COLOR AND POSITION BASED ON BRIGHTNESS
            svg.append('line')
                .attr('class', 'kdePoint')
                .attr('x1', xScale(d.brightness) + margin.left) // X POS SHOULD BE THE SAME
                .attr('x2', xScale(d.brightness) + margin.left) // TO MAKE VERTICAL LINE
                .attr('y1', margin.top)
                .attr('y2', plotheight - margin.bottom)
                .attr('stroke', colorScale(d.brightness))
                .attr('stroke-width', 2)
                .attr('opacity', 0.7);

            // COMPUTE EXACT KDE
            let kdeDensity = 0;
            if (kde.length > 1) {
                // FIND THE 2 KDE POINTS CLOSEST TO THE BRIGHTNESS. KDE CURRENTLY LOOKS LIKE: [[300.0, 0.0012], [301.0, 0.0020], [302.0, 0.0028], ...]
                for (let i = 1; i < kde.length; i++) {
                    if (kde[i][0] >= d.brightness) { // ONCE THE BRIGHTNESS IS CLOSE ENOUGH
                        const [x1, y1] = kde[i - 1]; // GET THE 2 NEAREST BRIGHTNESS AND KDE VALS
                        const [x2, y2] = kde[i];
                        const t = (d.brightness - x1) / (x2 - x1);
                        kdeDensity = y1 + t * (y2 - y1); // DO LINEAR INERPOLATION
                        break;
                    }
                }
            }
            
            // COMPUTE PERCENTILE RANK FOR BRIGHTNESS
            const brightnessValues = filteredData.map(f => +f.brightness).sort(d3.ascending);
            const total = brightnessValues.length;
            let rank = d3.bisectRight(brightnessValues, d.brightness);
            const inverseRank = total - rank + 1;
            const percentile = (rank / total) * 100;
            const percentileRounded = Math.round(percentile);

            // UPDATE TOOLTIP BAR WITH INFO
            tooltipBar
                .style('display', 'block')
                .html(`
                    <strong>Selected Fire Info</strong><br><br>
                    <strong>Lat:</strong> ${d.latitude.toFixed(4)}<br>
                    <strong>Lon:</strong> ${d.longitude.toFixed(4)}<br>
                    <strong>Brightness:</strong> ${d.brightness}<br>
                    <strong>Density:</strong> ${kdeDensity.toExponential(3)}<br>
                    <strong>Percentile:</strong> ${percentileRounded}th<br>
                    <strong>Rank:</strong> ${inverseRank} / ${total}<br>
                    <em>Note: Lower rank means higher brightness in subset.</em>
                `);
            
            // UPDATE LEGEND TO INCLUDE SELECTED FIRE
            const fireColor = colorScale(d.brightness);
            const currentLegendData = [
            { label: "Mean Brightness", color: "purple", dash: "4 2" },
            { label: "Median Brightness", color: "green", dash: "2 2" },
            { label: "Selected Fire", color: fireColor, dash: "0" }
            ];

            drawLegend(legendSvg, currentLegendData);
        });

    // WHEN CLICK ELSEWHERE
    // HIDE TOOLTIP BAR, VERTICAL LINE, AND RESET DOT
    d3.select('#mapContainer').on('click', (event) => {
        if (!event.target.closest('circle')) {
            tooltipBar.style('display', 'none'); // RESET TOOLTIP BAR
            svg.selectAll('line.kdePoint').remove(); // RESET VERTICAL LINE

            if (selectedDot) { // RESET DOT
                selectedDot.attr('fill', d => colorScale(d.brightness))
                        .attr('stroke', null)
                        .attr('stroke-width', null);
                selectedDot = null;
            }
            
            // RESET LEGEND BACK TO MEAN/MEDIAN (DEFAULT)
            const baseLegend = [
            { label: "Mean Brightness", color: "purple", dash: "4 2" },
            { label: "Median Brightness", color: "green", dash: "2 2" }
            ];
            drawLegend(legendSvg, baseLegend);
        }
    });

    // SET INITIAL X,Y POSITIONS (NOT APPLIED ON THE DOT YET) BASED ON PROJECTIONS OF ACTUAL LAT/LONG
    filteredData.forEach(d => {
        const [x, y] = projection([d.longitude, d.latitude]) || [0, 0];
        d.x = x;
        d.y = y;
    });

    // FORCE SIMULATION TO PREVENT OVERLAPPING DOTS
    const simulation = d3.forceSimulation(filteredData)
        .force('x', d3.forceX(d => d.x).strength(1))
        .force('y', d3.forceY(d => d.y).strength(1))
        .force('collide', d3.forceCollide(4.5)) // ADJUST RADIUS DISTANCE BETWEEN DOTS
        .stop();

    // RUN SIMULATION FOR A FINITE NUMBER OF TIMES (NOT RISKING INF LOOP)
    for (let i = 0; i < 120; i++) simulation.tick();

    // ACTUALLY SET THE X,Y POS FOR THE DOTS
    circles
        .attr('cx', d => d.x)
        .attr('cy', d => d.y);
}

// -------------------- GLOBAL --------------------

// DEFINE MAP STRUCTURE
const mapWidth = 900;
const mapHeight = 600;

const mapSvg = d3.select("#mapContainer")
    .append("svg")
    .attr("viewBox", `0 0 ${mapWidth} ${mapHeight}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

// GET US MAP (TopoJSON → GeoJSON)
const us = await d3.json('https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json');
const states = topojson.feature(us, us.objects.states);
const usa = { type: "FeatureCollection", features: states.features };

const projection = d3.geoAlbersUsa()
    .fitSize([mapWidth, mapHeight], states);

const geoPath = d3.geoPath().projection(projection);

// DRAW MAP BACKGROUND
mapSvg.selectAll('path')
    .data(states.features)
    .join('path')
    .attr('d', geoPath)
    .attr('fill', '#e0e0e0')
    .attr('stroke', '#333')
    .attr('stroke-width', 0.5);

// SET GLOBAL COLOR GRADIENT FOR BRIGHTNESS
const fireDataForColor = await loadFireData();
const brightnessExtent = d3.extent(fireDataForColor, d => +d.brightness);
const colorScale = d3.scaleLinear()
    .domain([brightnessExtent[0], (brightnessExtent[0]+brightnessExtent[1])/2, brightnessExtent[1]])
    .range(['yellow', 'orange', 'red']);

// DEFINE KDE PLOT STRUCTURE
const plotwidth = 1000;
const plotheight = 500;
let kde = [];

// CREATE THE ACTUAL KDEPLOT SVG OBJECT
const svg = d3.select('#kdePlot')
    .append('svg')
    .attr('viewBox', `0 0 ${plotwidth} ${plotheight}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .classed('responsive-svg', true);

// DEFINE THE DISPLAY MARGINS FOR SCALES
let xScale, yScale;
const margin = { top: 20, right: 20, bottom: 50, left: 60 };

// CREATE THE ACTUAL LEGEND SVG OBJECT
d3.select("#legend").selectAll("*").remove();
const legendSvg = d3.select("#legend")
    .attr("width", 180)
    .attr("height", 80);

// LOAD INITIAL DATA
setButtonText(dayToggle, daynightFilter);
updatePageColors(daynightFilter);
loadAndPlot();
