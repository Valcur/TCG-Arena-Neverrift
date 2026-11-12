async function removeCardProperty() {
    if (!transitionCards || transitionCards.length === 0) return
    // Seulement si c'est une créature
    const cardData = functions.getCardData(transitionCards[0])
    if (cardData?.type !== "Creature") return
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

async function ini() {
    const tamerCard = cards?.Tamer?.[0]
    if (!tamerCard) return
    await functions.updateCards([tamerCard], {
        draggableTokens:
            [
                colorsPerPosition[game.turn.orderPosition] ?? colorsPerPosition[0]
            ]
    })
    await functions.repositionCards()
}

async function onCardsUpdate() {
    const row = 4
    const col = 4
    let myScore = 0

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

    await functions.changeCounterValue(0, myScore)

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
        "image": "https://valcur.github.io/TCG-Arena-MTG/Images/Tokens/Orange.png",
        "backgroundColor": "rgba(233, 125, 40, 0.8)"
    },
    {
        "id": "Green",
        "name": "Green token",
        "image": "https://valcur.github.io/TCG-Arena-MTG/Images/Tokens/Green.png",
        "backgroundColor": "rgba(69, 123, 64, 0.8)"
    },
    {
        "id": "Blue",
        "name": "Blue token",
        "image": "https://valcur.github.io/TCG-Arena-MTG/Images/Tokens/Blue.png",
        "backgroundColor": "rgba(52, 137, 143, 0.8)"
    },
    {
        "id": "Purple",
        "name": "Purple token",
        "image": "https://valcur.github.io/TCG-Arena-MTG/Images/Tokens/Purple.png",
        "backgroundColor": "rgba(73, 33, 108, 0.8)"
    }
]

async function checkEvole() {
    console.log(cards)
    const fromCard = cards.EvolveFrom?.[0]
    const toCard = cards.EvolveTo?.[0]
    if (!fromCard || !toCard) return

    const fromData = functions.getCardData(fromCard)
    const toData = functions.getCardData(toCard)

    await functions.updateCards([fromCard], {
        grouppedToId: [toCard.id]
    })

    await functions.repositionCards()
} 