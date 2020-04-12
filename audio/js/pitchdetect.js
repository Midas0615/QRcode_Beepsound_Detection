/*
The MIT License (MIT)

Copyright (c) 2014 Chris Wilson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

window.AudioContext = window.AudioContext || window.webkitAudioContext;

var isStarted = false;
var audioContext = null;
var isPlaying = false;
var sourceNode = null;
var analyser = null;
var theBuffer = null;
var DEBUGCANVAS = null;
var mediaStreamSource = null; 
var Counter = 0;
var detectorElem, 
	canvasElem,
	waveCanvas,
	pitchElem,
	noteElem,
	notenum,
	detuneElem,
	pitch,
	pitch_calc,
	delay,
	bufferLength,
	intervalCounter = null;

window.onload = function() {
	audioContext = new AudioContext();
	MAX_SIZE = Math.max(4,Math.floor(audioContext.sampleRate/5000));	// corresponds to a 5kHz signal
	var request = new XMLHttpRequest();
	request.open("GET", "../sounds/whistling3.ogg", true);
	request.responseType = "arraybuffer";
	request.onload = function() {
	  audioContext.decodeAudioData( request.response, function(buffer) { 
	    	theBuffer = buffer;
		} );
	}
	request.send();

	detectorElem = document.getElementById( "detector" );
	canvasElem = document.getElementById( "output" );
	DEBUGCANVAS = document.getElementById( "waveform" );
	if (DEBUGCANVAS) {
		waveCanvas = DEBUGCANVAS.getContext("2d");
		waveCanvas.strokeStyle = "black";
		waveCanvas.lineWidth = 1;
	}
	pitchElem = document.getElementById( "pitch" );
	noteElem = document.getElementById( "note" );
	detuneElem = document.getElementById( "detune" );
	detuneAmount = document.getElementById( "detune_amt" );

	detectorElem.ondragenter = function () { 
		this.classList.add("droptarget"); 
		return false; };
	detectorElem.ondragleave = function () { this.classList.remove("droptarget"); return false; };
	detectorElem.ondrop = function (e) {
  		this.classList.remove("droptarget");
  		e.preventDefault();
		theBuffer = null;

	  	var reader = new FileReader();
	  	reader.onload = function (event) {
	  		audioContext.decodeAudioData( event.target.result, function(buffer) {
	    		theBuffer = buffer;
	  		}, function(){alert("error loading!");} ); 

	  	};
	  	reader.onerror = function (event) {
	  		alert("Error: " + reader.error );
		};
	  	reader.readAsArrayBuffer(e.dataTransfer.files[0]);
	  	return false;
	};
}

function snsNoiseFilter(alphaValue, betaValue) {
    this.alpha = alphaValue;
    if (this.alpha === undefined) {
        this.alpha = 1.8;
    }
    this.beta = betaValue;
    if (this.beta === undefined) {
        this.beta = 0.03;
    }
    this.noise;
    this.noiseSum = 0;
    var sumFunction = function(a, b) {
        return a + b;
    };

    this.getNoise = function(input) {
        if (this.noiseSum == 0) {
            this.noise = input;
            this.noiseSum = this.noise.reduce(sumFunction, 0);
            return this.noise;
        }
        var inputSum = input.reduce(sumFunction, 0);
        var xnr = inputSum / this.noiseSum;
        if (xnr > this.alpha) {
            return this.noise;
        }
        var oneMinusBetaFactor = 1 - this.beta;
        for (var i = 0; i < input.length; i++) {
            this.noise[i] = oneMinusBetaFactor * this.noise[i] + this.beta * input[i];
        }
        this.noiseSum = oneMinusBetaFactor * inputSum + this.beta * this.noiseSum;
        return this.noise;
    };
}

function error() {
    alert('Stream generation failed.');
}

function getUserMedia(dictionary, callback) {
    try {
        navigator.getUserMedia = 
        	navigator.getUserMedia ||
        	navigator.webkitGetUserMedia ||
			navigator.mozGetUserMedia ||
			navigator.msGetUserMedia;
        navigator.getUserMedia(dictionary, callback, error);
    } catch (e) {
        alert('getUserMedia threw exception :' + e);
    }
}

var noiseFilter = new snsNoiseFilter();


function gotStream(stream) {
    // Create an AudioNode from the stream.
	mediaStreamSource = audioContext.createMediaStreamSource(stream);
	
	sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = theBuffer;
	sourceNode.loop = true;

    // Connect it to the destination.
    analyser = audioContext.createAnalyser();
	analyser.minDecibels = -90;
	analyser.maxDecibels = -10;
	analyser.smoothingTimeConstant = 0.85;
	analyser.fftSize = 128;
	bufferLength = analyser.frequencyBinCount;

	var distortion = audioContext.createWaveShaper();
	var gainNode = audioContext.createGain();
	var biquadFilter = audioContext.createBiquadFilter();
	var convolver = audioContext.createConvolver();

	mediaStreamSource.connect( analyser );
	analyser.connect(distortion);
	distortion.connect(biquadFilter);
	biquadFilter.connect(convolver);
	convolver.connect(gainNode);
	gainNode.connect(audioContext.destination);
	sourceNode.start( 0 );
	isPlaying = true;
	isLiveInput = false;
	updatePitch();
}



function toggleLiveInput() {
	console.log("isPlaying..", isPlaying)
    if (isPlaying) {
        //stop playing and return
		// sourceNode.stop( 0 );
		if (intervalCounter!= null) {
			clearInterval(intervalCounter);
			intervalCounter = null;
		}
        sourceNode = null;
        analyser = null;
		isPlaying = false;
		isStarted = false;
		delay = "00000";
		if (!window.cancelAnimationFrame)
			window.cancelAnimationFrame = window.webkitCancelAnimationFrame;
		window.cancelAnimationFrame( rafID );
		return "Get Laytency"
	}
	document.getElementById("milliseconds").innerText = 0;
    getUserMedia(
    	{
            "audio": {
                "mandatory": {
                    "googEchoCancellation": "false",
                    "googAutoGainControl": "false",
                    "googNoiseSuppression": "false",
                    "googHighpassFilter": "false"
                },
                "optional": []
            },
		}, 
		// {audio: true},
		gotStream);
	return "stop"
}

var rafID = null;
var tracks = null;
var buflen = 1024;
var buf = new Float32Array( buflen );

var noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function noteFromPitch( frequency ) {
	var noteNum = 12 * (Math.log( frequency / 440 )/Math.log(2) );
	return Math.round( noteNum ) + 69;
}

function frequencyFromNoteNumber( note ) {
	return 440 * Math.pow(2,(note-69)/12);
}

function centsOffFromPitch( frequency, note ) {
	return Math.floor( 1200 * Math.log( frequency / frequencyFromNoteNumber( note ))/Math.log(2) );
}

var MIN_SAMPLES = 0;  // will be initialized when AudioContext is created.
var GOOD_ENOUGH_CORRELATION = 0.9; // this is the "bar" for how close a correlation needs to be

function autoCorrelate( buf, sampleRate ) {
	var SIZE = buf.length;
	var MAX_SAMPLES = Math.floor(SIZE/2);
	var best_offset = -1;
	var best_correlation = 0;
	var rms = 0;
	var foundGoodCorrelation = false;
	var correlations = new Array(MAX_SAMPLES);

	for (var i=0;i<SIZE;i++) {
		var val = buf[i];
		rms += val*val;
	}
	rms = Math.sqrt(rms/SIZE);
	if (rms<0.01) // not enough signal
		return -1;

	var lastCorrelation=1;
	for (var offset = MIN_SAMPLES; offset < MAX_SAMPLES; offset++) {
		var correlation = 0;

		for (var i=0; i<MAX_SAMPLES; i++) {
			correlation += Math.abs((buf[i])-(buf[i+offset]));
		}
		correlation = 1 - (correlation/MAX_SAMPLES);
		correlations[offset] = correlation; // store it, for the tweaking we need to do below.
		if ((correlation>GOOD_ENOUGH_CORRELATION) && (correlation > lastCorrelation)) {
			foundGoodCorrelation = true;
			if (correlation > best_correlation) {
				best_correlation = correlation;
				best_offset = offset;
			}
		} else if (foundGoodCorrelation) {
			// short-circuit - we found a good correlation, then a bad one, so we'd just be seeing copies from here.
			// Now we need to tweak the offset - by interpolating between the values to the left and right of the
			// best offset, and shifting it a bit.  This is complex, and HACKY in this code (happy to take PRs!) -
			// we need to do a curve fit on correlations[] around best_offset in order to better determine precise
			// (anti-aliased) offset.

			// we know best_offset >=1, 
			// since foundGoodCorrelation cannot go to true until the second pass (offset=1), and 
			// we can't drop into this clause until the following pass (else if).
			var shift = (correlations[best_offset+1] - correlations[best_offset-1])/correlations[best_offset];  
			return sampleRate/(best_offset+(8*shift));
		}
		lastCorrelation = correlation;
	}
	if (best_correlation > 0.01) {
		// console.log("f = " + sampleRate/best_offset + "Hz (rms: " + rms + " confidence: " + best_correlation + ")")
		return sampleRate/best_offset;
	}
	return -1;
//	var best_frequency = sampleRate/best_offset;
}

function updatePitch( time ) {
	var cycles = new Array;
	analyser.getFloatTimeDomainData( buf );
	var ac = autoCorrelate( buf, audioContext.sampleRate );
	var dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);
    var noise = noiseFilter.getNoise(dataArray);
    console.log("noise...", noise);
	// TODO: Paint confidence meter on canvasElem here.

	// if (DEBUGCANVAS) {  // This draws the current waveform, useful for debugging
	// 	waveCanvas.clearRect(0,0,512,256);
	// 	waveCanvas.strokeStyle = "red";
	// 	waveCanvas.beginPath();
	// 	waveCanvas.moveTo(0,0);
	// 	waveCanvas.lineTo(0,256);
	// 	waveCanvas.moveTo(128,0);
	// 	waveCanvas.lineTo(128,256);
	// 	waveCanvas.moveTo(256,0);
	// 	waveCanvas.lineTo(256,256);
	// 	waveCanvas.moveTo(384,0);
	// 	waveCanvas.lineTo(384,256);
	// 	waveCanvas.moveTo(512,0);
	// 	waveCanvas.lineTo(512,256);
	// 	waveCanvas.stroke();
	// 	waveCanvas.strokeStyle = "black";
	// 	waveCanvas.beginPath();
	// 	waveCanvas.moveTo(0,buf[0]);
	// 	for (var i=1;i<512;i++) {
	// 		waveCanvas.lineTo(i,128+(buf[i]*128));
	// 	}
	// 	waveCanvas.stroke();
	// }

 	if (ac == -1) {
 		detectorElem.className = "vague";
	 	pitchElem.innerText = "--";
		noteElem.innerText = "-";
		detuneElem.className = "";
		detuneAmount.innerText = "--";
 	} else {
	 	detectorElem.className = "confident";
		pitch = ac;
		pitch_calc = pitch.toFixed(0);
	 	pitchElem.innerText = Math.round( pitch ) ;
	 	var note =  noteFromPitch( pitch );
		noteElem.innerHTML = noteStrings[note%12];
		notenum = Number(note);
		var detune = centsOffFromPitch( pitch, note );
		if (detune == 0 ) {
			detuneElem.className = "";
			detuneAmount.innerHTML = "--";
		} else {
			if (detune < 0)
				detuneElem.className = "flat";
			else
				detuneElem.className = "sharp";
			detuneAmount.innerHTML = Math.abs( detune );
		}

		// console.log("Counter____", Counter)
		// console.log("pitch_calc.......", pitch_calc)
		// console.log("notenum", notenum)
		// var startTime = Date.now()
		// eval("var intervalCounter"+startTime+";");
		if (pitch_calc == 1000 && notenum == 83 && detune == 21)
		{	
			console.log("pitch_calc", pitch_calc);
			delay = document.getElementById("milliseconds").innerHTML;
			isStarted = !isStarted;
			var startTime = Date.now();
			if (isStarted){
				intervalCounter = setInterval(function () {
					var elapsedTime = Date.now() - startTime;
					document.getElementById("milliseconds").innerHTML = (elapsedTime / 1000).toFixed(3);
				}, 100);   
			} else {
				if (intervalCounter!=null && delay > 0.8){
					document.getElementById("get_laytency").innerText = toggleLiveInput();
				} else {
					isStarted = !isStarted;
				}
			}
			
			console.log("delay.....!", delay);
		}

		// if (pitch_calc == 1000 && notenum == 83 && detune == 21 && delay > 0.8)
		// {	
		// 	console.log("interval....", intervalCounter)
		// 	// console.log("initialinterval", initialinterval)
		// 	clearInterval(intervalCounter);
		// 	// document.getElementById("milliseconds").innerHTML = delay;
		// 	console.log(pitch_calc)
		// 	// sourceNode.stop( 0 );
		// 	// sourceNode = null;
		// 	// analyser = null;
		// 	isPlaying = false;
		// 	document.getElementById("get_laytency").innerText = "Get Laytency";
		// 	// if (!window.cancelAnimationFrame)
		// 	// window.cancelAnimationFrame = window.webkitCancelAnimationFrame;
		// 	// window.cancelAnimationFrame( rafID );
		// 	// return;
		// }
	}
	if (!window.requestAnimationFrame)
	window.requestAnimationFrame = window.webkitRequestAnimationFrame;
	rafID = window.requestAnimationFrame( updatePitch );
}
