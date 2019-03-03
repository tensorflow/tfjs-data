async function run() {
  // media.navigator.streams.fake = '1';
  const videoElement = document.getElementById('webcam');

  const iter = await tf.data.webcam(videoElement);
  // await new Promise(resolve => setTimeout(resolve, 2000));
  for (let i = 0; i < 10; i++) {
    const t = await iter.next();
    console.log(t.value.shape);
  }
}

run().then(() => {
  console.log('done');
})
