import {load} from 'cheerio';

export function parseHTML(html: string): string {
  const $ = load(html);
  // Adjust selectors based on the structure of the tech docs you're crawling
  const content = $('main').text() || $('article').text() || $('body').text();
  return content;
}
