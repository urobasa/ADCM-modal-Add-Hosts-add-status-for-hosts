Displays ADCM host states in the 'Add hosts' modal for cluster

The ADCM Host Status Overlay improves the ADCM interface by displaying the current status of each host in the "Add hosts" modal window for the cluster.

The extension automatically calls the ADCM internal API (/api/v2/hosts/?ordering=name) on the same domain where the interface is opened. The resulting statuses are cached in the browser and displayed as labels to the right of the host name.
The cache is updated each time the modal window is opened, ensuring the data is always up-to-date.

Supports:

dynamic search in the modal;

host filtering;

complete list rebuilding (when ADCM displays "No results found");

correct operation after DOM changes.

The extension does not collect or transmit any user data. All processing is performed locally, within the user's browser.

