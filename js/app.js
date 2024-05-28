/**
 * @author Johanna Pohl, Christian Brück best.ways GmbH
 * @version 1.0.0
 * 
 * @license
 * Copyright (c) 2015 Example Corporation Inc.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE. 
 * 
 */

// TODO: 🐞 Camera still active after scan
// TODO: 📅 Take 365 days into account

(function () {
    'use strict'

    /**
     * Class representing a trip.
     * A trip contains start and end date and the dose the driver has received.
     */
    class Trip {
        #id = new Date().getTime().toString() + '-' + Math.floor(Math.random() * 1000)
        /**
         * Creates a new trip 
         * @param {Date} startDate - When the trip started
         * @param {Date} endDate - When the trip ended
         * @param {number} dose - The dose the driver has received
         */
        constructor(startDate, endDate, dose) {
            this.startDate = startDate
            this.endDate = endDate
            this.dose = dose
        }

        get id() {
            return this.#id
        };
    }

    /**
    * ToastTypes can be used to set the appeareance of toast messages.
    *
    * @type {{ Normal: number; Success: number; Warning: number; Error: number; }}
    */
    const ToastType = {
        Normal: 0,
        Success: 1,
        Warning: 2,
        Error: 3
    }

    // ---------- HTML elements ----------

    const alertDoseLimitSoon = document.getElementById('dose-limit-soon')
    const alertDoseLimitExceeded = document.getElementById('dose-limit-exceeded')

    const buttonManualInput = document.getElementById('manual-input')
    const buttonResetForm = document.getElementById('form-reset')
    const buttonSave = document.getElementById('save')

    const divAwaitingCameraAccess = document.getElementById('awaiting-camera-access')
    const divToast = document.getElementById('toast')
    const divDoseProgress = document.getElementById('dose-progress')
    const divResult = document.getElementById('result')
    const divManualInputCollapse = document.getElementById('manualInputCollapse')

    const formDoseCalculation = document.getElementById('doseCalculationForm')
    const formFieldFile = document.getElementById('file')
    const formFieldImport = document.getElementById('import')
    const formFieldNuclide = document.getElementById('nuclide')
    const formFieldHalfLife = document.getElementById('half-life')
    const formFieldDoseRate = document.getElementById('dose-rate')
    const formFieldDistance = document.getElementById('measure-distance')
    const formFieldReleaseDate = document.getElementById('release-date')
    const formFieldReleaseTime = document.getElementById('release-time')
    const formFieldPickUpDate = document.getElementById('pick-up-date')
    const formFieldPickUpTime = document.getElementById('pick-up-time')
    const formFieldDropOffDate = document.getElementById('drop-off-date')
    const formFieldDropOffTime = document.getElementById('drop-off-time')
    const formFieldSeat = document.getElementById('seat')

    const htmlVideo = document.getElementById('video')
    const listTrips = document.getElementById('trips-list')
    const modalCodeScanner = document.getElementById('codeScannerModal')
    const progressBarDose = document.getElementById('dose-progress-bar')

    const textNoCameraAccess = document.getElementById('no-camera-access')
    const textResultDose = document.getElementById('result-dose')
    const textResultTime = document.getElementById('result-time')
    const textDoseTotal = document.getElementById('dose-total')
    const textDosePercentage = document.getElementById('dose-percentage')
    const textTripCount = document.getElementById('trip-count')

    // ---------- Global variables ---------

    /**
     * The maximum dose in mSv / a
     * @type {number}
     */
    const maxDose = 1000

    /**
     * Holds all the entered trips as Trip objects. Used for the chart, the list and calculating
     * In a real life application this data would propably result from a database.
     * @type {Array}
     */
    let trips = []

    /**
     * Trip that is currently being entered
     * @type {Trip}
     */
    let currentTrip

    // ---------- Bootstrap instances ----------

    const resultBootstrap = bootstrap.Collapse.getOrCreateInstance(divResult, { toggle: false })
    const toastBootstrap = bootstrap.Toast.getOrCreateInstance(divToast)
    const manualInputCollapse = bootstrap.Collapse.getOrCreateInstance(divManualInputCollapse, { toggle: false })

    // ---------- Third party ----------

    const codeReader = new ZXing.BrowserAztecCodeReader()
    const chart = new Chart('chart', {
        type: 'line',
        options: {
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: "Strahlendosis in µSv"
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: "Datum"
                    }
                }
            }
        },
        data: {
            labels: trips.map((el) => el.endDate),
            datasets: [{
                backgroundColor: 'rgba(11,94,215,0.2)',
                fill: false,
                borderColor: 'rgb(11,94,215)',
                data: trips.map((el) => el.dose),
                label: 'Strahlendosis in µSv'
            }],
        }
    })

    // ---------- Functions ----------

    /**
     * Updates the chart that shows the total dose.
     * For that it uses the trips array that holds all the trips.
     */
    function updateChart() {
        const newLabeLData = []
        const newData = []

        for (let i = 0; i < trips.length; i++) {
            newLabeLData.push(formatDateTimeForChartLabel(trips[i].endDate))
            let curDose = trips[i].dose
            for (let j = i; j > 0; j--) {
                curDose += trips[j - 1].dose
            }
            newData.push(curDose)
        }

        chart.data.labels = newLabeLData
        chart.data.datasets[0].data = newData
        chart.update()
    }

    /**
    * Uses a video stream to detect a aztec code and returns the result as string.
    *
    * @async
    * @param {*} video - The video stream
    * @returns {string} - String that was read in the code
    */
    async function detectAztecCode(video) {
        let result
        try {
            result = await codeReader.decodeFromVideo(video)
        } catch (error) {
            console.error(error)
        }
        return result
    }

    /**
    * Reads a XML string and sets the fields of the form accordingly
    *
    * @param {string} xml - The XML document as a string
    */
    function xmlToFormFields(xml) {
        manualInputCollapse.show()

        const parser = new DOMParser()
        const xmlDoc = parser.parseFromString(xml, 'text/xml')

        const root = xmlDoc.getElementsByTagName('NuclideTreatment')[0]

        const nuclide = root.getElementsByTagName('Nuclide')[0]
        const nuclideName = nuclide.getElementsByTagName('Name')[0].childNodes[0].nodeValue
        const halfLife = nuclide.getElementsByTagName('HalfLife')[0].childNodes[0].nodeValue

        const measurement = root.getElementsByTagName('Measurement')[0]
        const doseRate = measurement.getElementsByTagName('DoseRate')[0].childNodes[0].nodeValue
        const distance = measurement.getElementsByTagName('Distance')[0].childNodes[0].nodeValue
        const timestamp = measurement.getElementsByTagName('Timestamp')[0].childNodes[0].nodeValue

        const releaseDateTime = new Date(timestamp * 1000)

        const dateString = releaseDateTime.getFullYear() + '-' + `${releaseDateTime.getMonth() + 1}`.padStart(2, '0') + '-' + `${releaseDateTime.getDate()}`.padStart(2, '0')
        const timeString = `${releaseDateTime.getHours()}`.padStart(2, '0') + ':' + `${releaseDateTime.getMinutes()}`.padStart(2, '0')

        const index = [...formFieldNuclide.options].findIndex(option => option.text === nuclideName)
        index === -1 ? formFieldNuclide.value = '' : formFieldNuclide.selectedIndex = index

        formFieldHalfLife.value = halfLife
        formFieldDoseRate.value = doseRate
        formFieldDistance.value = distance
        formFieldReleaseDate.value = dateString
        formFieldReleaseTime.value = timeString

        updateMinDates()
    }

    /**
     * 
     * Displays a toast message by utilizing the bootstrap toast functionality.
     * 
     * @param {string} message - Message to be displayed
     * @param {ToastType} type - Type of toast message. Impacts appereance.
     */
    function showToast(message, type = ToastType.Normal) {
        const classList = ['toast']
        switch (type) {
            case ToastType.Success:
                classList.push('text-bg-success')
                break
            case ToastType.Warning:
                classList.push('text-bg-warn')
                break
            case ToastType.Error:
                classList.push('text-bg-danger')
                break
            default:
                break
        }
        divToast.setAttribute('class', classList.join(' '))
        divToast.getElementsByClassName('toast-body')[0].textContent = message
        toastBootstrap.show()
    }

    /**
     * Initialize the camera and try to scan a aztec code.
     * Shows a toast message depending on scan result.
     */
    async function scan() {
        if (navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ video: true })
                .then(async (stream) => {
                    divAwaitingCameraAccess.classList.add('d-none')
                    htmlVideo.srcObject = stream
                    htmlVideo.classList.remove('d-none')
                    try {
                        const scanResult = await detectAztecCode(htmlVideo)

                        if (!scanResult) return
                        bootstrap.Modal.getInstance(modalCodeScanner)?.hide()
                        xmlToFormFields(scanResult)
                        showToast('Scan erfolgreich!', ToastType.Success)
                    } catch {
                        showToast('Scan ungültig!', ToastType.Error)
                    }
                })
                .catch((error) => {
                    console.error(error)
                    divAwaitingCameraAccess.classList.add('d-none')
                    textNoCameraAccess.classList.remove('d-none')
                })
        }
    }

    /**
     * Resets the code reader and hides the overlay that shows the video stream.
     */

    function resetScan() {
        codeReader.reset()
        htmlVideo.srcObject?.getTracks()?.forEach(track => track.stop())
        htmlVideo.classList.add('d-none')
        textNoCameraAccess.classList.add('d-none')
        divAwaitingCameraAccess.classList.remove('d-none')
    }

    /**
           * Calculates the dose the driver has received
           *
           * @param {number} doseRateRelease - Dose rate that was measured at release
           * @param {number} doseRateReleaseDistance - Distance the dose was measured at
           * @param {number} distanceInVehicle - Distance between passenger and driver in the vehicle
           * @param {number} halfLifeInSeconds - Half-life in seconds of the nuclide that was given to the patient
           * @param {number} releaseTimestamp - Timestamp the patient was released at
           * @param {number} pickUpTimestamp - Timestamp the patient was picked up
           * @param {number} dropOffTimestamp - Timestamp the patient was dropped off
           * @returns {number} - The calculated dose 
           */
    function calculateDose(
        doseRateRelease,
        doseRateReleaseDistance,
        distanceInVehicle,
        halfLifeInSeconds,
        releaseTimestamp,
        pickUpTimestamp,
        dropOffTimestamp
    ) {
        const lambda = Math.LN2 / (halfLifeInSeconds / 3600)
        const timeSinceRelease = (pickUpTimestamp - releaseTimestamp) / 3600
        const doseRateStart = doseRateRelease * Math.exp(-lambda * timeSinceRelease)
        const doseRateDriverPatient = (doseRateStart * Math.pow((doseRateReleaseDistance / distanceInVehicle), 2)) * 0.5
        const travelTime = (dropOffTimestamp - pickUpTimestamp) / 3600
        const dose = (doseRateDriverPatient / lambda) * (1 - Math.exp(-lambda * travelTime))

        return dose
    }

    /**
     * Builds the table that shows all the trips with their doses and times
     */
    function createList() {
        /**
         * Clear table first to make sure the trips are in order
         */
        listTrips.querySelectorAll('tr').forEach((el) => el.remove())

        const localeOptions = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }

        /**
         * Insert each trip into the list
         */
        trips.forEach((m) => {
            const row = document.createElement('tr')
            const tdStart = document.createElement('td')
            const tdEnd = document.createElement('td')
            const tdDose = document.createElement('td')
            const tdDeleteButton = document.createElement('td')

            tdStart.innerText = m.startDate.toLocaleString([], localeOptions)
            tdEnd.innerText = m.endDate.toLocaleString([], localeOptions)
            tdDose.innerText = Math.round(m.dose * 1000) / 1000 + ' µSv'

            tdDeleteButton.innerHTML = '<button type="button" title="löschen" class="btn-close btn-delete"></button>'
            row.appendChild(tdStart)
            row.appendChild(tdEnd)
            row.appendChild(tdDose)
            row.appendChild(tdDeleteButton)
            row.id = m.id
            listTrips.appendChild(row)
        })
    }

    /**
     * 
     * Reads a file and fires the callback afterwards.
     * 
     * @param {Blob} file - File to be read
     * @param {function} callback - Function to be executed
     */

    function readFile(file, callback) {
        if (file) {
            const reader = new FileReader()
            reader.readAsText(file, 'UTF-8')
            reader.onload = function (evt) {
                try {
                    callback(evt.target.result)
                    showToast('Die Datei wurde erfolgreich eingelesen.', ToastType.Success)

                } catch (error) {
                    showToast('Die Datei ist ungültig.', ToastType.Error)
                    console.error(error)
                }
            }
            reader.onerror = function (evt) {
                showToast('Fehler beim Lesen der Datei.', ToastType.Error)
            }

            formFieldFile.value = ''
        }
    }

    /**
     * 
     * Parses a csv file containing trips and measuremt data to calculate doses
     * 
     * @param {string} csv - CSV that will be used
     */

    function csvToTrips(csv) {
        const rows = csv.split('\n')

        if (rows[0].split(';').length !== 7) throw new Error('Invalid CSV file')

        const importedTrips = []
        for (let i = 0; i < rows.length; i++) {
            const values = rows[i].split(';')
            try {
                for (let j = 0; j < values.length; j++) {
                    if (!isNumeric(values[j])) throw new Error(`Cannot parse line ${i + 1} in CSV file!`)
                    if (values[j].includes(',') || values[j].includes('.')) {
                        values[j] = parseFloat(values[j].replace(',', '.'))
                    } else {
                        values[j] = parseInt(values[j])
                    }
                }
            } catch (error) {
                console.error(error.message)
                continue
            }

            const dose = calculateDose(values[2], values[1], values[6], values[0], values[3], values[4], values[5])

            const startDate = new Date(values[4] * 1000)
            const endDate = new Date(values[5] * 1000)

            const trip = new Trip(startDate, endDate, dose)

            importedTrips.push(trip)
        }
        saveTrips(importedTrips)
    }

    /**
     * Checks if a string is representing a number
     * @param {string} str - String that will be tested
     * @returns {boolean} - True if is representing a number
     */
    function isNumeric(str) {
        if (typeof str !== 'string') return false
        str = str.replace(',', '.')
        return !isNaN(str) &&
            !isNaN(parseFloat(str))
    }

    /**
     * 
     * Resets the form.
     * 
     */
    function resetForm() {
        formDoseCalculation.classList.remove('was-validated')
        formDoseCalculation.reset()
        resultBootstrap.hide()
        currentTrip = undefined
    }

    /**
     * Formats a given date to a locale string.
     * 
     * @param {Date} date - Date to be formatted
     * @returns {string} - The formatted date as string
     */
    function formatDateTimeForChartLabel(date) {
        return [date.toLocaleDateString([], { year: 'numeric', month: '2-digit', day: '2-digit' }), date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })]
    }

    /**
     * 
     * Clamps a number between a lower and a higher number. 
     * 
     * @param {number} num - Number to be clamped
     * @param {number} max - Max number
     * @param {number} min  - Min number
     * @returns {number} - Clamped number
     */
    const clampNumber = (num, max, min) =>
        Math.max(Math.min(num, Math.max(max, min)), Math.min(max, min))

    /**
     * 
     * Sets the dose progess bar to a given value.
     * Min 0 <-> Max 100
     * Numbers out of range will be clamped.
     * 
     * @param {number} percentage - Number between 0 - 100
     */
    function setProgressBar(percentage) {
        textDosePercentage.innerText = percentage + ' %'
        progressBarDose.classList.remove('bg-success', 'bg-warning', 'bg-danger')

        divDoseProgress.setAttribute('ariaValuenow', percentage)

        progressBarDose.style.width = clampNumber(percentage, 0, 100) + '%'

        if (percentage < 50) {
            progressBarDose.classList.add('bg-success')
            alertDoseLimitExceeded.classList.add('d-none')
            alertDoseLimitSoon.classList.add('d-none')
        } else if (percentage < 100) {
            progressBarDose.classList.add('bg-warning')
            alertDoseLimitExceeded.classList.add('d-none')
            alertDoseLimitSoon.classList.remove('d-none')
        } else {
            alertDoseLimitSoon.classList.add('d-none')
            alertDoseLimitExceeded.classList.remove('d-none')
            progressBarDose.classList.add('bg-danger')
        }
    }

    /**
     * Saves one or more trips in the trips array and updates the list.
     * In a real life application this would propably inserted in a database.
     * 
     * @param {[Trip]} tripsToSave - The trip(s) that should be added to the list
     */
    function saveTrips(tripsToSave) {
        if (!Array.isArray(tripsToSave)) {
            tripsToSave = [tripsToSave]
        }

        trips.push(...tripsToSave)
        trips.sort((a, b) => a.endDate.getTime() - b.endDate.getTime())
        createList()
        setDose()
        resetForm()
    }

    /**
     * 
     * Sets the counter at the trips accordeon
     * 
     * @param {number} count - Number the counter will be set to
     */
    function setTripCount(count) {
        textTripCount.innerText = count;
    }

    /**
     * Calclates the total dose and sets the UI accordingly.
     */
    function setDose() {
        let total = 0.0
        trips.forEach((el) => { total += el.dose })
        textDoseTotal.innerText = total < 1 ? Math.round(total * 1000) / 1000 : '~ ' + Math.round(total)
        const percentage = Math.round((total / maxDose) * 100)
        setProgressBar(percentage)
        setTripCount(trips.length)
        updateChart()
    }

    /**
     * 
     * Removes a trip from the trips array and updates the UI
     * 
     * @param {string} id - ID of the trip that will be removed
     */
    function deleteTrips(id) {
        trips = trips.filter(item => item.id !== id)
        setDose()
    }

    /**
     * 
     * Sets the HTML5 date and time pickers so a release cannot be before a pickup and a pickup cannot be before a drop off
     * 
     */
    function updateMinDates() {
        const releaseDate = formFieldReleaseDate.value
        const pickUpDate = formFieldPickUpDate.value
        const dropOffDate = formFieldDropOffDate.value

        if (releaseDate) {
            formFieldPickUpDate.min = releaseDate
        } else {
            formFieldPickUpDate.removeAttribute("min")
        }

        if (pickUpDate) {
            if (releaseDate && pickUpDate < releaseDate) {
                formFieldDropOffDate.min = releaseDate
            } else {
                formFieldDropOffDate.min = pickUpDate

            }
        } else if (releaseDate) {
            formFieldDropOffDate.min = releaseDate
        }

        if (pickUpDate && releaseDate && pickUpDate <= releaseDate) {
            formFieldPickUpTime.min = formFieldReleaseTime.value
        } else {
            formFieldPickUpTime.removeAttribute("min")
        }

        if (pickUpDate && dropOffDate && dropOffDate <= pickUpDate) {
            formFieldDropOffTime.min = formFieldPickUpTime.value
        } else if (releaseDate && dropOffDate <= releaseDate) {
            formFieldDropOffTime.min = formFieldReleaseTime.value
        } else {
            formFieldDropOffTime.removeAttribute("min")
        }
    }

    /**
     * Submits the form and checks for validility using bootstraps form validator
     */
    function submitForm() {
        if (!formDoseCalculation.checkValidity()) {
            const inputs = divManualInputCollapse.getElementsByTagName('input')

            for (const el of inputs) {
                if (el.matches(':invalid')) {
                    manualInputCollapse.show()
                    break
                }
            }
        } else {
            const distanceInVehicle = parseInt(formFieldSeat.value)
            const distance = parseInt(formFieldDistance.value)
            const halfLifeInSeconds = parseInt(formFieldHalfLife.value)
            const doseRate = Number.parseFloat(formFieldDoseRate.value) / 60 / 60

            const releaseDate = new Date(formFieldReleaseDate.value + ' ' + formFieldReleaseTime.value)
            const pickUpDate = new Date(formFieldPickUpDate.value + ' ' + formFieldPickUpTime.value)
            const dropOffDate = new Date(formFieldDropOffDate.value + ' ' + formFieldDropOffTime.value)

            const releaseTimestamp = releaseDate / 1000
            const pickUpTimestamp = pickUpDate / 1000
            const dropOffTimestamp = dropOffDate / 1000

            const exposureTime = (dropOffTimestamp - pickUpTimestamp) / 60

            const dose = calculateDose(doseRate, distance, distanceInVehicle, halfLifeInSeconds, releaseTimestamp, pickUpTimestamp, dropOffTimestamp)

            currentTrip = new Trip(pickUpDate, dropOffDate, dose)

            textResultDose.textContent = Math.round(dose * 1000) / 1000
            textResultTime.textContent = Math.round(exposureTime)
            resultBootstrap.show()
        }
        formDoseCalculation.classList.add('was-validated')
    }


    // ---------- Eventlisteners ----------

    modalCodeScanner.addEventListener('shown.bs.modal', () => scan())
    modalCodeScanner.addEventListener('hidden.bs.modal', () => resetScan())
    buttonResetForm.addEventListener('click', () => resetForm())
    buttonManualInput.addEventListener('click', () => manualInputCollapse.show())
    formFieldFile.addEventListener('change', (event) => readFile(event.target.files[0], xmlToFormFields))
    formFieldImport.addEventListener('change', (event) => readFile(event.target.files[0], csvToTrips))
    buttonSave.addEventListener('click', () => saveTrips(currentTrip))

    formFieldNuclide.addEventListener('change', (event) => {
        formFieldHalfLife.value = event.target.value
    })

    formFieldHalfLife.addEventListener('change', () => {
        formFieldNuclide.value = ''
    })

    formFieldReleaseDate.addEventListener('blur', () => updateMinDates())
    formFieldPickUpDate.addEventListener('blur', () => updateMinDates())
    formFieldDropOffDate.addEventListener('blur', () => updateMinDates())

    formFieldReleaseTime.addEventListener('blur', () => updateMinDates())
    formFieldPickUpTime.addEventListener('blur', () => updateMinDates())
    formFieldDropOffTime.addEventListener('blur', () => updateMinDates())

    listTrips.addEventListener('click', (e) => {
        if (!e.target.classList.contains('btn-delete')) return
        const row = e.target.closest('tr')
        deleteTrips(row.id)
        updateChart()
        row.remove()
    })

    formDoseCalculation.addEventListener('submit', e => {
        e.preventDefault()
        e.stopPropagation()
        submitForm()
    }, false)
})(window, document)
