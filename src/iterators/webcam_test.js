async function run() {
  // media.navigator.streams.fake = '1';
  const videoElement = document.getElementById('webcam');

  const webcam = tf.data.webcam(videoElement, {frameRate: 1});
  const iter = await webcam.iterator();
  for (let i = 0; i < 3; i++) {
    const t = await iter.next();
    console.log(t.value.shape);
    console.log(t.value.dataSync());
  }
}

run().then(() => {
  console.log('done');
})
