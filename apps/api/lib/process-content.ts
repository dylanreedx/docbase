import {crawlPage} from './crawl-page';
import {embedAndIndexContent} from './embed-content';
import {parseHTML} from './parse-html';

export async function processTechDoc(url: string) {
  const html = await crawlPage(url);
  const content = parseHTML(html);
  const indexedContent = await embedAndIndexContent(content, url);

  console.log(`Processed and indexed content from ${url}`);
  return indexedContent;
}
