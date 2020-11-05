// these functions run in browser context, not node.js
// (lodash has been added to the browser)

const handleListings = (nodeListArray) => {
  return nodeListArray.map(listing => {
    const [id] = listing.id.match(/\d+/g);
    return {
      id,
      production: listing.children[1].innerText,
      type: listing.children[2].innerText,
      local: listing.children[3].innerText,
      startEndDates: listing.children[4].innerText
    };
  });
};

const handleDetails = (detailsElement) => {
  const results = {};
  const shootingLocations = [];
  const alternateTitles = [];
  const children = Array.from(detailsElement.children);
  children.pop(); // last child is always an empty 'p' tag

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.children[0]) {
      // first, deal with two-parters here (shootingLocations, alternateTitles)
      if (i < children.length - 1) {
        const nextChild = children[i + 1];
        const nextChildren = nextChild && nextChild.children && Array.from(nextChild.children);
        if (nextChildren && nextChildren[0] && nextChildren[0].tagName === 'LI') {
          if (child.innerText.indexOf('Shooting Locations') === 0) {
            nextChildren.forEach(location => {
              shootingLocations.push(location.innerText);
            });
            results.shootingLocations = shootingLocations;
          } else if (child.innerText.indexOf('Alternate Titles') === 0) {
            nextChildren.forEach(title => {
              alternateTitles.push(title.innerText);
            });
            results.alternateTitles = alternateTitles;
          }
          // important next two lines
          i++;
          continue;
        }
      }
      // else, deal with one-parters
      const name = child.children[0].innerText.replace(/\W/g, '');
      const nameKey = _.camelCase(name);
      const nameFull = child.innerHTML;
      const nameSpan = child.children[0].outerHTML;
      const nameValue = nameFull.substring(nameSpan.length).trim();
      results[nameKey] = nameValue;
    }
  }
  return results;
};

module.exports = {
  handleDetails,
  handleListings
};
