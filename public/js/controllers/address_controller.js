/* global Dygraph */
/* global $ */
import { Controller } from 'stimulus'
import { isEmpty } from 'lodash-es'
import { barChartPlotter } from '../helpers/chart_helper'
import globalEventBus from '../services/event_bus_service'

function txTypesFunc (d) {
  var p = []

  d.time.map((n, i) => {
    p.push([new Date(n), d.sentRtx[i], d.receivedRtx[i], d.tickets[i], d.votes[i], d.revokeTx[i]])
  })
  return p
}

function amountFlowFunc (d) {
  var p = []

  d.time.map((n, i) => {
    var v = d.net[i]
    var netReceived = 0
    var netSent = 0

    v > 0 ? (netReceived = v) : (netSent = (v * -1))
    p.push([new Date(n), d.received[i], d.sent[i], netReceived, netSent])
  })
  return p
}

function unspentAmountFunc (d) {
  var p = []
  // start plotting 6 days before the actual day
  if (d.length > 0) {
    let v = new Date(d.time[0])
    p.push([new Date().setDate(v.getDate() - 6), 0])
  }

  d.time.map((n, i) => p.push([new Date(n), d.amount[i]]))
  return p
}

function formatter (data) {
  var html = this.getLabels()[0] + ': ' + ((data.xHTML === undefined) ? '' : data.xHTML)
  data.series.map(function (series) {
    if (series.color === undefined) return ''
    var l = `<span style="color: ` + series.color + ';"> ' + series.labelHTML
    html = `<span style="color:#2d2d2d;">` + html + `</span>`
    html += '<br>' + series.dashHTML + l + ': ' + (isNaN(series.y) ? '' : series.y) + '</span>'
  })
  return html
}

function customizedFormatter (data) {
  var html = this.getLabels()[0] + ': ' + ((data.xHTML === undefined) ? '' : data.xHTML)
  data.series.map(function (series) {
    if (series.color === undefined) return ''
    if (series.y === 0 && series.labelHTML.includes('Net')) return ''
    var l = `<span style="color: ` + series.color + ';"> ' + series.labelHTML
    html = `<span style="color:#2d2d2d;">` + html + `</span>`
    html += '<br>' + series.dashHTML + l + ': ' + (isNaN(series.y) ? '' : series.y + ' DCR') + '</span> '
  })
  return html
}

function plotGraph (processedData, otherOptions) {
  var commonOptions = {
    digitsAfterDecimal: 8,
    showRangeSelector: true,
    legend: 'follow',
    xlabel: 'Date',
    fillAlpha: 0.9,
    labelsKMB: true
  }

  return new Dygraph(
    document.getElementById('history-chart'),
    processedData,
    { ...commonOptions, ...otherOptions }
  )
}

export default class extends Controller {
  static get targets () {
    return ['options', 'addr', 'btns', 'unspent',
      'flow', 'zoom', 'interval', 'numUnconfirmed', 'formattedTime', 'txnCount']
  }

  initialize () {
    var _this = this
    let isFirstFire = true
    globalEventBus.on('BLOCK_RECEIVED', function (data) {
      // The update of the Time UTC and transactions count will only happen during the first confirmation
      if (!isFirstFire) {
        return
      }
      isFirstFire = false
      _this.numUnconfirmedTargets.forEach((el, i) => {
        el.classList.add('hidden')
      })
      let numConfirmed = 0
      _this.formattedTimeTargets.forEach((el, i) => {
        el.textContent = data.block.formatted_time
        numConfirmed++
      })
      _this.txnCountTargets.forEach((el, i) => {
        let transactions = numConfirmed + parseInt(el.dataset.txnCount)
        _this.setTxnCountText(el, transactions)
      })
    })
    $.getScript('/js/vendor/dygraphs.min.js', () => {
      _this.typesGraphOptions = {
        labels: ['Date', 'Sending (regular)', 'Receiving (regular)', 'Tickets', 'Votes', 'Revocations'],
        colors: ['#69D3F5', '#2971FF', '#41BF53', 'darkorange', '#FF0090'],
        ylabel: 'Number of Transactions by Type',
        title: 'Transactions Types',
        visibility: [true, true, true, true, true],
        legendFormatter: formatter,
        plotter: barChartPlotter,
        stackedGraph: true,
        fillGraph: false
      }

      _this.amountFlowGraphOptions = {
        labels: ['Date', 'Received', 'Spent', 'Net Received', 'Net Spent'],
        colors: ['#2971FF', '#2ED6A1', '#41BF53', '#FF0090'],
        ylabel: 'Total Amount (DCR)',
        title: 'Sent And Received',
        visibility: [true, false, false, false],
        legendFormatter: customizedFormatter,
        plotter: barChartPlotter,
        stackedGraph: true,
        fillGraph: false
      }

      _this.unspentGraphOptions = {
        labels: ['Date', 'Unspent'],
        colors: ['#41BF53'],
        ylabel: 'Cummulative Unspent Amount (DCR)',
        title: 'Total Unspent',
        plotter: [Dygraph.Plotters.linePlotter, Dygraph.Plotters.fillPlotter],
        legendFormatter: customizedFormatter,
        stackedGraph: false,
        visibility: [true],
        fillGraph: true
      }

      _this.defaultHash = 'list-view'
      var hashVal = window.location.hash.replace('#', '') || _this.defaultHash

      if (hashVal.length === 0 || hashVal === _this.defaultHash) {
        window.history.pushState({}, this.addr, '#' + _this.defaultHash)
      } else {
        var selectedVal = this.optionsTarget.namedItem(hashVal)
        $(this.optionsTarget).val((selectedVal ? selectedVal.value : 'types'))
        this.changeView()
      }
    })
  }

  setTxnCountText (el, count) {
    if (el.dataset.formatted) {
      el.textContent = count + ' transaction' + (count > 1 ? 's' : '')
    } else {
      el.textContent = count
    }
  }
  connect () {
    let _this = this
    this.formattedTimeTargets.forEach((el, i) => {
      el.textContent = 'Unconfirmed'
    })
    this.txnCountTargets.forEach((el, i) => {
      _this.setTxnCountText(el, parseInt(el.dataset.txnCount))
    })
  }

  disconnect () {
    if (this.graph !== undefined) {
      this.graph.destroy()
    }
  }

  drawGraph () {
    var _this = this
    var graphType = _this.options
    var interval = _this.interval

    window.history.pushState({}, this.addr, '#' + graphType)

    $('#no-bal').addClass('d-hide')
    $('#history-chart').removeClass('d-hide')
    $('#toggle-charts').addClass('d-hide')

    if (_this.unspent === '0' && graphType === 'unspent') {
      $('#no-bal').removeClass('d-hide')
      $('#history-chart').addClass('d-hide')
      $('body').removeClass('loading')
      return
    }

    $.ajax({
      type: 'GET',
      url: '/api/address/' + _this.addr + '/' + graphType + '/' + interval,
      beforeSend: function () {},
      success: function (data) {
        if (!isEmpty(data)) {
          var newData = []
          var options = {}

          switch (graphType) {
            case 'types':
              newData = txTypesFunc(data)
              options = _this.typesGraphOptions
              break

            case 'amountflow':
              newData = amountFlowFunc(data)
              options = _this.amountFlowGraphOptions
              $('#toggle-charts').removeClass('d-hide')
              break

            case 'unspent':
              newData = unspentAmountFunc(data)
              options = _this.unspentGraphOptions
              break
          }

          if (_this.graph === undefined) {
            _this.graph = plotGraph(newData, options)
          } else {
            _this.graph.updateOptions({
              ...{ 'file': newData },
              ...options })
            _this.graph.resetZoom()
          }
          _this.updateFlow()
          _this.xVal = _this.graph.xAxisExtremes()
        } else {
          $('#no-bal').removeClass('d-hide')
          $('#history-chart').addClass('d-hide')
          $('#toggle-charts').removeClass('d-hide')
        }

        $('body').removeClass('loading')
      }
    })
  }

  changeView (e) {
    $('.addr-btn').removeClass('btn-active')
    $(e ? e.srcElement : '.chart').addClass('btn-active')

    var _this = this
    _this.disableBtnsIfNotApplicable()

    $('body').addClass('loading')

    var divHide = 'list'
    var divShow = _this.btns

    if (divShow !== 'chart') {
      divHide = 'chart'
      $('body').removeClass('loading')
      window.history.pushState({}, this.addr, '#' + _this.defaultHash)
    } else {
      _this.drawGraph()
    }

    $('.' + divShow + '-display').removeClass('d-hide')
    $('.' + divHide + '-display').addClass('d-hide')
  }

  changeGraph (e) {
    if (e.srcElement.className.includes('chart-size')) {
      $(e.srcElement).siblings().removeClass('btn-active')
      $(e.srcElement).toggleClass('btn-active')
    }

    $('body').addClass('loading')
    this.drawGraph()
  }

  updateFlow () {
    if (this.options !== 'amountflow') return ''
    for (var i = 0; i < this.flow.length; i++) {
      var d = this.flow[i]
      this.graph.setVisibility(d[0], d[1])
    }
  }

  onZoom (e) {
    $(e.srcElement).siblings().removeClass('btn-active')
    $(e.srcElement).toggleClass('btn-active')

    if (this.graph === undefined) {
      return
    }
    $('body').addClass('loading')
    this.graph.resetZoom()
    if (this.zoom > 0 && this.zoom < this.xVal[1]) {
      this.graph.updateOptions({
        dateWindow: [(this.xVal[1] - this.zoom), this.xVal[1]]
      })
    }
    $('body').removeClass('loading')
  }

  disableBtnsIfNotApplicable () {
    var val = new Date(this.addrTarget.dataset.oldestblocktime)
    var d = new Date()

    var pastYear = d.getFullYear() - 1
    var pastMonth = d.getMonth() - 1
    var pastWeek = d.getDate() - 7
    var pastDay = d.getDate() - 1

    this.enabledButtons = []
    var setApplicableBtns = (className, ts, numIntervals) => {
      var isDisabled = (val > new Date(ts)) ||
                    (this.options === 'unspent' && this.unspent === '0') ||
                    numIntervals < 2

      if (isDisabled) {
        this.zoomTarget.getElementsByClassName(className)[0].setAttribute('disabled', isDisabled)
        this.intervalTarget.getElementsByClassName(className)[0].setAttribute('disabled', isDisabled)
      }

      if (className !== 'year' && !isDisabled) {
        this.enabledButtons.push(className)
      }
    }

    setApplicableBtns('year', new Date().setFullYear(pastYear), this.intervalTarget.dataset.year)
    setApplicableBtns('month', new Date().setMonth(pastMonth), this.intervalTarget.dataset.month)
    setApplicableBtns('week', new Date().setDate(pastWeek), this.intervalTarget.dataset.week)
    setApplicableBtns('day', new Date().setDate(pastDay), this.intervalTarget.dataset.day)

    if (parseInt(this.intervalTarget.dataset.txcount) < 20 || this.enabledButtons.length === 0) {
      this.enabledButtons[0] = 'all'
    }

    $('input.chart-size').removeClass('btn-active')
    $('input.chart-size.' + this.enabledButtons[0]).addClass('btn-active')
  }

  get options () {
    return this.optionsTarget.value
  }

  get addr () {
    return this.addrTarget.outerText
  }

  get unspent () {
    return this.unspentTarget.id
  }

  get btns () {
    return this.btnsTarget.getElementsByClassName('btn-active')[0].name
  }

  get zoom () {
    var v = this.zoomTarget.getElementsByClassName('btn-active')[0].name
    return parseFloat(v)
  }

  get interval () {
    return this.intervalTarget.getElementsByClassName('btn-active')[0].name
  }

  get flow () {
    var ar = []
    var boxes = this.flowTarget.querySelectorAll('input[type=checkbox]')
    boxes.forEach((n) => {
      var intVal = parseFloat(n.value)
      ar.push([isNaN(intVal) ? 0 : intVal, n.checked])
      if (intVal === 2) {
        ar.push([3, n.checked])
      }
    })
    return ar
  }
}