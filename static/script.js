document.getElementById('compareBtn').addEventListener('click', async () => {
    const db1File = document.getElementById('db1').files[0];
    const db2File = document.getElementById('db2').files[0];
    const passwordDb1 = document.getElementById('passwordDb1').value;
    const passwordDb2 = document.getElementById('passwordDb2').value;
    const outputPath = document.getElementById('outputPath').value;

    const statusDiv = document.getElementById('status');
    const downloadLink = document.getElementById('downloadLink');
    downloadLink.style.display = 'none';

    if (!db1File || !db2File || !passwordDb1 || !passwordDb2) {
        statusDiv.textContent = 'Please fill in all fields.';
        return;
    }
    if (!outputPath.endsWith('.kdbx')) {
        statusDiv.textContent = 'Output file must end in .kdbx';
        return;
    }
    statusDiv.textContent = 'Comparing databases...';

    const formData = new FormData();
    formData.append('db1', db1File);
    formData.append('db2', db2File);
    formData.append('passwordDb1', passwordDb1);
    formData.append('passwordDb2', passwordDb2);
    formData.append('outputPath', outputPath);

    try {
        const response = await fetch('/compare', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            //const result = await response.json(); // Expecting JSON response
            //statusDiv.textContent = result.message; // Display success message
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = downloadLink.querySelector('a');
            a.href = url;
            a.download = outputPath;
            downloadLink.style.display = 'block';

            statusDiv.textContent = 'Comparison complete! Download the diff database:';

        } else {
            statusDiv.textContent = 'Error: ' + response.statusText;
        }
    } catch (error) {
        statusDiv.textContent = 'Error: ' + error;
    }
});