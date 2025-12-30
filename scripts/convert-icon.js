const fs = require('fs')
const path = require('path')
const pngToIco = require('png-to-ico').default || require('png-to-ico')

async function convertIcon() {
  const pngPath = path.join(__dirname, '../build/icon.png')
  const icoPath = path.join(__dirname, '../build/icon.ico')

  try {
    console.log('Converting icon.png to icon.ico...')
    // png-to-ico can accept a single file path or array of paths
    const ico = await (typeof pngToIco === 'function' ? pngToIco(pngPath) : pngToIco([pngPath]))
    fs.writeFileSync(icoPath, ico)
    console.log('✅ Successfully created icon.ico')
  } catch (error) {
    console.error('❌ Error converting icon:', error)
    console.error('Note: You may need to manually convert icon.png to icon.ico using an online tool')
    console.error('Recommended: https://convertio.co/png-ico/ or https://cloudconvert.com/png-to-ico')
    process.exit(1)
  }
}

convertIcon()

