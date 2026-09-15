
d3.json("/worldmap.geojson")
    .then(data => {

        const map = document.querySelector("#map");

        const width = map.clientWidth;
        const height = map.clientHeight;

        const svg = d3.select("#map")
            .append("svg")
            .attr("width", width)
            .attr("height", height);

        const projection = d3.geoEquirectangular()
            .fitSize([width, height], data);

        const path = d3.geoPath(projection);

        svg.selectAll("path")
            .data(data.features)
            .join("path")
            .attr("d", path)
            .attr("fill", "lightblue")
            .attr("stroke", "black");

            let input;
            let inputString;
            document.querySelector('#submit').addEventListener('click', ()=>{
                input = document.querySelector("#input"); // input field.
                inputString = input.value.toLowerCase(); // inputed string.
                let particular = data.features.find(feature => inputString === feature.properties.name.toLowerCase());
                if (particular){
                    let paths = svg.selectAll("path");
                    let path = paths.filter(path => path === particular);
                    path.attr("fill", "blue");
                    input.focus();
                } else {
                    alert("Country not found!");
                    input.focus();
                }
            });
    });

