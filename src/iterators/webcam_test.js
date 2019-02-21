async function run() {
  // media.navigator.streams.fake = '1';
  const videoElement = document.getElementById('webcam');

  const webcam = tf.data.webcam(videoElement, {width:500, height:500, frameRate:1});
  const iter = await webcam.iterator();
  for(let i =0;i<10;i++){
    const t = await iter.next();
    t.value.print();
  }
}

run().then(()=>{
  console.log('done');
})
