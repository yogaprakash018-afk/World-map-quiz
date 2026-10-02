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

        const geoPathGenerator = d3.geoPath(projection);

        svg.selectAll("path")
            .data(data.features)
            .join("path")
            .attr("d", geoPathGenerator)
            .attr("fill", "white")
            .attr("stroke", "black");

        let countries = [];
        let score = 0;
        const subButton = document.querySelector('#submit');
        const scoreField = document.querySelector("#score");
        const input = document.querySelector("#input");

        subButton.addEventListener('click', async () => {
            const inputString = input.value.trim().toLowerCase();
            const particularCountry = data.features.find(feature => inputString === feature.properties.name.toLowerCase());

            if (particularCountry) {
                if (!countries.includes(particularCountry)) {
                    countries.push(particularCountry);
                    score += 1;
                }

                svg.selectAll("path")
                    .filter(d => d === particularCountry)
                    .attr("fill", "teal");

                scoreField.innerHTML = `<h1>Score : ${score}</h1>`;
                input.value = "";
                input.focus();

                if (countries.length === data.features.length || score === data.features.length) {
                    scoreField.innerHTML = `<h1>You Won!, Final Score : ${score}</h1>`;
                    
                    await fetch("/score", {
                        method: "POST",
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ finalScore: score }),
                    });
                    score = 0;
                    countries = [];
                    input.value = "";
                    svg.selectAll("path")
                        .data(data.features)
                        .join("path")
                        .attr("d", geoPathGenerator)
                        .attr("fill", "white")
                        .attr("stroke", "black");
                }
            } else {
                scoreField.innerHTML = `<h1>You Lose!, Score : ${score}</h1>`;
                subButton.disabled = true;
                input.value = "";
                input.disabled = true;

                await fetch("/score", {
                    method: "POST",
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ finalScore: score }),
                });
                window.location.reload();
            };
        });
    })
    .catch(err => console.log("Error loading map GeoJSON : ", err));