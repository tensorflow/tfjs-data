// const WebcamStream = require('./webcam').WebcamStream;
// import {WebcamStream} from "./webcam";

async function run() {
  console.log(tf.data.webcam);
  const videoElement = document.getElementById('webcam');
  const webcamElement = document.getElementById('webcam');
  console.log(webcamElement);

  const webcam = tf.data.webcam(videoElement, {width:500, height:500});
  const iter = await webcam.iterator();
  for(let i =0;i<100;i++){
    console.log(await iter.next());
  }
}

run().then(()=>{
  console.log('done');
})
