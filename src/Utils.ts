import * as Path from 'path';
import * as Fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import Axios from 'axios';
import isImage from 'is-image';

export async function downloadImage(url: string) : Promise<string> {
    // Random file name + original extension.
    const path = Path.resolve('./dist/upload/', uuidv4() + '.' + getUrlExtension(url));
    if (!isImage(path)) {
        return new Promise((resolve, reject) => reject('Bad file type'));
    }
    // Make dir if not existing.
    if (!Fs.existsSync('./dist/upload/')) {
        Fs.mkdirSync('./dist/upload/', { recursive: true });
    }

    const writer = Fs.createWriteStream(path);
    const response = await Axios({
      url,
      method: 'GET',
      responseType: 'stream'
    })
    response.data.pipe(writer)
  
    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(path))
      writer.on('error', reject)
    })
}

function getUrlExtension(url: string) {
    return url.split(/[#?]/)[0].split('.').pop().trim();
}