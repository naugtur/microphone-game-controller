function gotStream(stream) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const audioContext = new AudioContext();
  var mediaStreamSource = audioContext.createMediaStreamSource(stream);

  var analyser = audioContext.createAnalyser();
  analyser.fftSize = 32;

  var bufferLength = analyser.frequencyBinCount;
  var dataArray = new Uint8Array(bufferLength);

  mediaStreamSource.connect(analyser);
  const sample = adaptiveThreshold(() => {
    flag();
  });
  function monitor() {
    requestAnimationFrame(monitor);
    analyser.getByteTimeDomainData(dataArray);
    const raw = dataArray.map((i) => Math.abs(i - 128.0));
    const results = raw.map(sample);

    canvasCtx.fillStyle = "rgb(200, 200, 200)";
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
    //avgs
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeStyle = "rgb(0, 0, 0)";

    canvasCtx.beginPath();

    var sliceWidth = (canvas.width * 1.0) / results.length;
    var x = 0;

    for (var i = 0; i < results.length; i++) {
      var v = results[i] / 256;
      var y = v * canvas.height;

      if (i === 0) {
        canvasCtx.moveTo(x, y);
      } else {
        canvasCtx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    canvasCtx.lineTo(canvas.width, 0);
    canvasCtx.stroke();
    //values
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeStyle = "rgb(255, 0, 0)";

    canvasCtx.beginPath();

    var sliceWidth = (canvas.width * 1.0) / results.length;
    var x = 0;

    for (var i = 0; i < results.length; i++) {
      var v = raw[i] / 256;
      var y = v * canvas.height;

      if (i === 0) {
        canvasCtx.moveTo(x, y);
      } else {
        canvasCtx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    canvasCtx.lineTo(canvas.width, 0);
    canvasCtx.stroke();
  }
  requestAnimationFrame(monitor);
  var canvas = document.querySelector(".vis");
  var canvasCtx = canvas.getContext("2d");
}

const flagElem = document.querySelector(".flag");
flagElem.style.visibility = "hidden";
let timerr;
function flag() {
  clearTimeout(timerr);
  flagElem.style.visibility = "visible";
  timerr = setTimeout(() => (flagElem.style.visibility = "hidden"), 200);
}

document.querySelector(".btn").addEventListener("click", () => {
  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then(gotStream)
    .catch(console.error);
});

function rollingAverage(samples = 100) {
  const avgHistory = [];
  let avgSum = 0.0;
  return {
    full() {
      return avgHistory.length >= samples;
    },
    add(value) {
      avgHistory.push(value);
      avgSum += value;
      if (avgHistory.length > samples) {
        const bye = avgHistory.shift();
        avgSum -= bye;
      }
    },
    get() {
      return avgSum / avgHistory.length;
    },
  };
}

function recentMinMax(time) {
  let min = Infinity,
    max = -Infinity;
  const aggregate = { min: rollingAverage(10), max: rollingAverage(10) };
  let shifted = false;
  const timer = setInterval(() => {
    shifted = true;
    aggregate.max.add(max);
    aggregate.min.add(min);
    min = Infinity;
    max = -Infinity;
  }, time);

  function get() {
    return shifted
      ? { min: aggregate.min.get(), max: aggregate.max.get() }
      : { min, max };
  }
  return {
    timer,
    add(value) {
      if (value > max) {
        max = value;
      }
      if (value < min) {
        min = value;
      }
    },
    get,
    getSpan() {
      const span = get();
      return span.max - span.min;
    },
  };
}

function adaptiveThreshold(hit) {
  const average = rollingAverage(500);
  const minmax = recentMinMax(200);

  return (value) => {
    average.add(value);
    minmax.add(value);
    const avg = average.get();
    const silenceThreshold = minmax.get().min + 4;

    if (
      average.full() &&
      Math.abs(avg - value) - silenceThreshold > minmax.getSpan() / 2.0
    ) {
      hit();
    }

    return minmax.getSpan();
  };
}
