async function removeCardProperty() {
    if (!transitionCards || transitionCards.length === 0) return
    await functions.updateCards(transitionCards, {
        draggableTokens:
            [
                colorsPerPosition[game.turn.orderPosition] ?? colorsPerPosition[0]
            ]
    })


    for (const card of transitionCards) {
        await functions.giveCardTo(card)
    }
    await functions.repositionCards()
}

async function onCardsUpdate() {
    const row = 2
    const col = 1
    const myScore = 0

    for (let i = 1; i <= col; i++) {
        for (let j = 1; j <= row; j++) {
            const card = cards?.[`Board_${i}_${j}`]?.[0]
            if (card && card.draggableTokens?.length > 0) {
                const cardToken = card.draggableTokens[card.draggableTokens.length - 1]
                if (cardToken.id === colorsPerPosition[game.turn.orderPosition]?.id) {
                    myScore++
                }
            }
        }
    }

    game.data.Manager.score = myScore

    if (!game.turn.isMyTurn) return
    
    let hasMadeChanges = false
    for (let i = 1; i <= col; i++) {
        for (let j = 1; j <= row; j++) {
            const card = cards?.[`Board_${i}_${j}`]?.[0]

            if (card && card.draggableTokens?.length > 1) {
                await functions.updateCards([card], {
                    draggableTokens: [card.draggableTokens[card.draggableTokens.length - 1]]
                })
                hasMadeChanges = true
            }
        }
    }
    if (hasMadeChanges) {
        await functions.repositionCards()
    }
}

const colorsPerPosition = [
    {
        "id": "Orange",
        "name": "Orange token",
        "image": "https://valcur.github.io/TCG-Arena-MTG/Images/Tokens/Orange.png"
    },
    {
        "id": "Green",
        "name": "Green token",
        "image": "https://valcur.github.io/TCG-Arena-MTG/Images/Tokens/Green.png"
    },
    {
        "id": "Blue",
        "name": "Blue token",
        "image": "https://valcur.github.io/TCG-Arena-MTG/Images/Tokens/Blue.png"
    },
    {
        "id": "Purple",
        "name": "Purple token",
        "image": "https://valcur.github.io/TCG-Arena-MTG/Images/Tokens/Purple.png"
    }
]