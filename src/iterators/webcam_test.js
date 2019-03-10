
async function run() {
  const videoElement = document.getElementById('webcam');
  const iter = await tf.data.webcam(videoElement, {
    resizeWidth: 100,
    resizeHeight: 200,
    centerCropSize: [100, 200],
    cropBox: tf.tensor1d([50, 50, 150, 250]),
    cropBoxInd: tf.Tensor1D = tf.tensor1d([0], 'int32'),
  });

  for (let i = 0; i < 1; i++) {
    const t = await iter.next();
    console.log(t.value.shape);

    t.value.print();


    // .expandDims(0)
    // .toFloat()
    // .div(tf.scalar(127))
    // .sub(tf.scalar(1));
    const canvas = document.getElementById('canvas');
    tf.browser.toPixels(t.value.toFloat().div(tf.scalar(256)), canvas);
  }

  //         await new Promise(resolve => setTimeout(resolve, 200));
  // const iter =
  //     await tf.data.webcam(null, {resizeWidth: 300, resizeHeight: 300});
  // await new Promise(resolve => setTimeout(resolve, 2000));

  // console.log('111', iter);

  // const fromPixels2DContext =
  //     document.getElementById('canvas1').getContext('2d');
  // fromPixels2DContext.canvas.width = videoElement.width;
  // fromPixels2DContext.canvas.height = videoElement.height;
  // fromPixels2DContext.drawImage(
  //     videoElement, 0, 0, videoElement.width, videoElement.height);


  // await new Promise(resolve => setTimeout(resolve, 2000));

  // iter.stop();

  // for (let i = 0; i < 10; i++) {
  //   const t = await iter.next();
  //   console.log(t);
  //   // console.log(t.value.max().dataSync()[0]);
  //   // console.log(t.value.min().dataSync()[0]);
  // }
  // await new Promise(resolve => setTimeout(resolve, 5000));

  // await iter.start();
  // for (let i = 0; i < 10; i++) {
  //   const t = await iter.next();

  //   console.log(t.value.max().dataSync()[0]);
  //   console.log(t.value.min().dataSync()[0]);
  // }

  // iter.stop();

  // await iter.start();
}

run().then(() => {
  console.log('done');
})
